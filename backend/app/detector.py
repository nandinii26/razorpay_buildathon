import os
import sys
import uuid
import json
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from google import genai
from google.genai import types

# Ensure parent directory is in path when running as script
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.app.database import SessionLocal, get_db
from backend.app.models import Customer, Order, Payment, Subscription, RecoveryCase, AuditLog
from backend.app.policy import RecoveryAction, evaluate_policy

def log_audit_event(db: Session, case_id: uuid.UUID, step: str, status: str, action: str = None, message: str = ""):
    log = AuditLog(
        id=uuid.uuid4(),
        case_id=case_id,
        step=step,
        status=status,
        action=action,
        message=message
    )
    db.add(log)

def detect_recovery_cases(db: Session):
    """
    Scans the database to identify and record revenue risk cases (Day 2 requirements).
    Categorizes cases into:
    - payment_failure: failed payment on one-off orders
    - checkout_abandoned: pending/failed one-off orders with NO payment attempts
    - subscription_renewal_failure: failed payments on subscription billing cycle orders,
      or subscriptions in past_due/unpaid state.
    
    Also handles recovery detection by marking resolved cases as 'recovered'.
    """
    # -------------------------------------------------------------
    # 1. SUBSCRIPTION STATES (past_due or unpaid)
    # -------------------------------------------------------------
    unpaid_subs = db.query(Subscription).filter(
        Subscription.status.in_(["past_due", "unpaid"])
    ).all()
    
    for sub in unpaid_subs:
        # Check if an open case already exists for this subscription
        existing_case = db.query(RecoveryCase).filter(
            RecoveryCase.subscription_id == sub.id,
            RecoveryCase.type == "subscription_renewal_failure",
            RecoveryCase.status == "open"
        ).first()
        
        if not existing_case:
            customer = db.query(Customer).filter(Customer.id == sub.customer_id).first()
            risk_case = RecoveryCase(
                id=uuid.uuid4(),
                customer_id=sub.customer_id,
                subscription_id=sub.id,
                type="subscription_renewal_failure",
                amount=sub.amount,
                currency=sub.currency,
                status="open",
                risk_score=customer.risk_score if customer else 0.5,
                created_at=sub.current_period_start
            )
            db.add(risk_case)
            log_audit_event(db, risk_case.id, "detected", "success", message=f"Revenue risk case of type {risk_case.type} detected. Amount at risk: {risk_case.currency} {risk_case.amount}.")

    # If subscription is active, mark any open cases for it as recovered
    active_subs = db.query(Subscription).filter(Subscription.status == "active").all()
    for sub in active_subs:
        open_cases = db.query(RecoveryCase).filter(
            RecoveryCase.subscription_id == sub.id,
            RecoveryCase.status == "open"
        ).all()
        for case in open_cases:
            case.status = "recovered"
            case.updated_at = datetime.utcnow()
            log_audit_event(db, case.id, "resolved", "recovered", message="Case resolved automatically. Associated subscription billing cycle has returned to active.")

    # -------------------------------------------------------------
    # 2. FAILED ORDERS
    # -------------------------------------------------------------
    failed_orders = db.query(Order).filter(Order.status == "failed").all()
    
    for order in failed_orders:
        # Check if a successful payment exists for this order
        success_payment = db.query(Payment).filter(
            Payment.order_id == order.id,
            Payment.status == "succeeded"
        ).first()
        
        if success_payment:
            # If a success payment exists, any open case for this order should be recovered
            open_cases = db.query(RecoveryCase).filter(
                RecoveryCase.order_id == order.id,
                RecoveryCase.status == "open"
            ).all()
            for case in open_cases:
                case.status = "recovered"
                case.updated_at = datetime.utcnow()
                log_audit_event(db, case.id, "resolved", "recovered", message="Case resolved automatically. A successful payment attempt was detected for this order.")
            continue
            
        # No successful payment exists, so this is at risk.
        # Check if we already have an open case for this order
        existing_case = db.query(RecoveryCase).filter(
            RecoveryCase.order_id == order.id,
            RecoveryCase.status == "open"
        ).first()
        
        if not existing_case:
            customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
            has_subscription = db.query(Subscription).filter(Subscription.customer_id == order.customer_id).first() is not None
            
            # Determine type
            if has_subscription:
                case_type = "subscription_renewal_failure"
            else:
                # Check if there are any payment attempts
                has_payments = db.query(Payment).filter(Payment.order_id == order.id).first() is not None
                if has_payments:
                    case_type = "payment_failure"
                else:
                    case_type = "checkout_abandoned"
            
            latest_failed_payment = db.query(Payment).filter(
                Payment.order_id == order.id,
                Payment.status == "failed"
            ).order_by(Payment.created_at.desc()).first()
            
            risk_case = RecoveryCase(
                id=uuid.uuid4(),
                customer_id=order.customer_id,
                order_id=order.id,
                payment_id=latest_failed_payment.id if latest_failed_payment else None,
                type=case_type,
                amount=order.amount,
                currency=order.currency,
                status="open",
                risk_score=customer.risk_score if customer else 0.5,
                created_at=order.created_at
            )
            db.add(risk_case)
            log_audit_event(db, risk_case.id, "detected", "success", message=f"Revenue risk case of type {risk_case.type} detected. Amount at risk: {risk_case.currency} {risk_case.amount}.")

    # -------------------------------------------------------------
    # 3. PENDING ORDERS (representing potential abandoned checkouts)
    # -------------------------------------------------------------
    # Any pending order older than 30 minutes is considered an abandoned checkout
    cutoff_time = datetime.utcnow() - timedelta(minutes=30)
    pending_orders = db.query(Order).filter(
        Order.status == "pending",
        Order.created_at < cutoff_time
    ).all()
    
    for order in pending_orders:
        success_payment = db.query(Payment).filter(
            Payment.order_id == order.id,
            Payment.status == "succeeded"
        ).first()
        
        if success_payment:
            open_cases = db.query(RecoveryCase).filter(
                RecoveryCase.order_id == order.id,
                RecoveryCase.status == "open"
            ).all()
            for case in open_cases:
                case.status = "recovered"
                case.updated_at = datetime.utcnow()
                log_audit_event(db, case.id, "resolved", "recovered", message="Case resolved automatically. A successful payment attempt was detected for this order.")
            continue
            
        existing_case = db.query(RecoveryCase).filter(
            RecoveryCase.order_id == order.id,
            RecoveryCase.status == "open"
        ).first()
        
        if not existing_case:
            customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
            # If it's pending and has no payments, it's checkout_abandoned
            has_payments = db.query(Payment).filter(Payment.order_id == order.id).first() is not None
            case_type = "payment_failure" if has_payments else "checkout_abandoned"
            
            risk_case = RecoveryCase(
                id=uuid.uuid4(),
                customer_id=order.customer_id,
                order_id=order.id,
                type=case_type,
                amount=order.amount,
                currency=order.currency,
                status="open",
                risk_score=customer.risk_score if customer else 0.5,
                created_at=order.created_at
            )
            db.add(risk_case)
            log_audit_event(db, risk_case.id, "detected", "success", message=f"Revenue risk case of type {risk_case.type} detected. Amount at risk: {risk_case.currency} {risk_case.amount}.")

    # -------------------------------------------------------------
    # 4. RESOLVE CASES WITH RECENT SUCCESSFUL PAYMENTS (GENERAL SYNC)
    # -------------------------------------------------------------
    # Find all open recovery cases
    open_cases = db.query(RecoveryCase).filter(RecoveryCase.status == "open").all()
    for case in open_cases:
        resolved = False
        if case.order_id:
            # Check if order has a successful payment now
            success_pay = db.query(Payment).filter(
                Payment.order_id == case.order_id,
                Payment.status == "succeeded"
            ).first()
            if success_pay:
                resolved = True
        elif case.subscription_id:
            # Check if subscription is now active
            sub = db.query(Subscription).filter(
                Subscription.id == case.subscription_id,
                Subscription.status == "active"
            ).first()
            if sub:
                resolved = True
                
        if resolved:
            case.status = "recovered"
            case.updated_at = datetime.utcnow()
            log_audit_event(db, case.id, "resolved", "recovered", message="Case resolved automatically via general sync. A successful payment or active subscription was detected.")
            
    db.commit()
    
    # Run AI Diagnosis on any open undiagnosed cases
    run_diagnosis_cycle(db)

def run_detector():
    """
    CLI runner for risk detector. Runs scan and prints comparison stats.
    """
    db = SessionLocal()
    try:
        print("Running Revenue Risk Detector...")
        detect_recovery_cases(db)
        
        # Calculate totals from recovery_cases table
        open_cases = db.query(RecoveryCase).filter(RecoveryCase.status == "open").all()
        recovered_cases = db.query(RecoveryCase).filter(RecoveryCase.status == "recovered").all()
        
        open_sum = sum(c.amount for c in open_cases)
        recovered_sum = sum(c.amount for c in recovered_cases)
        
        print("\n=== Risk Detector Results ===")
        print(f"Total Open Risk Cases: {len(open_cases)}")
        print(f"Total Amount at Risk:  INR {open_sum:,.2f}")
        
        # Breakdown by type
        types = ["payment_failure", "checkout_abandoned", "subscription_renewal_failure"]
        print("\nBreakdown of Open Cases:")
        for t in types:
            c_list = [c for c in open_cases if c.type == t]
            c_sum = sum(c.amount for c in c_list)
            print(f"  - {t.replace('_', ' ').title()}: {len(c_list)} cases (INR {c_sum:,.2f})")
            
        print(f"\nTotal Recovered Cases: {len(recovered_cases)}")
        print(f"Total Amount Recovered: INR {recovered_sum:,.2f}")
        
        # Day 1 Math Check
        subquery_succeeded_orders = db.query(Payment.order_id).filter(Payment.status == 'succeeded', Payment.order_id.isnot(None))
        orders_at_risk = db.query(func.sum(Order.amount)).filter(
            Order.status == 'failed',
            Order.id.not_in(subquery_succeeded_orders)
        ).scalar() or Decimal('0.00')
        
        subs_at_risk = db.query(func.sum(Subscription.amount)).filter(
            Subscription.status.in_(['past_due', 'unpaid'])
        ).scalar() or Decimal('0.00')
        
        day1_total = orders_at_risk + subs_at_risk
        
        print("\n=== Validation Check ===")
        print(f"Day 1 Calculation total at risk:   INR {day1_total:,.2f}")
        print(f"Day 2 Table open cases total at risk: INR {open_sum:,.2f}")
        
        diff = abs(Decimal(str(open_sum)) - day1_total)
        if diff < Decimal('0.01'):
            print("SUCCESS: Checkpoint passed! The totals match perfectly.")
        else:
            print(f"WARNING: The totals differ by INR {diff:,.2f}")
            
    except Exception as e:
        print(f"Error running detector: {e}")
    finally:
        db.close()


# RecoveryAction Enum is imported from backend.app.policy


class AIDiagnosisSchema(BaseModel):
    diagnosis: str = Field(description="Brief explanation of why the payment failed based on customer and transaction context.")
    confidence: float = Field(description="Confidence level in the diagnosis, from 0.0 (no confidence) to 1.0 (absolute certainty).")
    recommended_action: RecoveryAction = Field(description="Best next step to recover this customer, selected strictly from the RecoveryAction options.")
    reasoning: str = Field(description="Step-by-step logic detailing why you came to this diagnosis.")


def get_rule_based_diagnosis(payment_info: dict, customer_info: dict) -> dict:
    reason = payment_info.get("failure_reason") or ""
    amount = payment_info.get("amount") or 0.0
    method = payment_info.get("payment_method") or "N/A"
    code = payment_info.get("error_code") or ""
    risk_score = customer_info.get("risk_score") or 0.0
    case_type = payment_info.get("type") or ""
    
    # Defaults
    diagnosis = "An unexplained payment failure occurred."
    confidence = 0.70
    recommended_action = RecoveryAction.ESCALATE_TO_HUMAN
    reasoning = f"No specific failure reason was provided in the transaction context. Payment method: {method}."
    
    if case_type == "subscription_renewal_failure" and not ("expired_card" in reason or "EXPIRED_CARD" in code or "authentication_failed" in reason or "AUTH_FAILED" in code):
        diagnosis = "Subscription renewal payment failed."
        confidence = 0.90
        recommended_action = RecoveryAction.RETRY_SUBSCRIPTION
        reasoning = f"This is a recurring subscription renewal transaction that failed. Payment method: {method}."
    elif "insufficient_funds" in reason or "INSUFFICIENT_FUNDS" in code:
        diagnosis = "The customer's bank account or card has insufficient funds to cover the transaction."
        confidence = 0.95
        if case_type == "subscription_renewal_failure":
            recommended_action = RecoveryAction.RETRY_SUBSCRIPTION
        else:
            recommended_action = RecoveryAction.RETRY_PAYMENT
        reasoning = f"The gateway returned explicit error {code or 'insufficient_funds'}. The user has attempted the transaction, indicating intent to buy, but lacks the necessary balance."
        
    elif "expired_card" in reason or "EXPIRED_CARD" in code:
        diagnosis = "The credit or debit card registered on the customer's account has expired."
        confidence = 0.98
        recommended_action = RecoveryAction.SEND_PAYMENT_LINK
        reasoning = f"The payment was rejected with error {code or 'expired_card'}. The card is physically expired, meaning retrying the same card will continue to fail."
        
    elif "authentication_failed" in reason or "AUTH_FAILED" in code:
        diagnosis = "3D Secure (3DS) authentication failed. The customer did not complete the OTP verification or PIN entry."
        confidence = 0.85
        recommended_action = RecoveryAction.SEND_PAYMENT_LINK
        reasoning = "The gateway returned auth failed. This is usually caused by customer drop-off on the bank verification page or incorrect OTP inputs."
        
    elif "network_error" in reason or "NETWORK_ERROR" in code:
        diagnosis = "A temporary network or server-side communication failure occurred between the merchant and the issuing bank."
        confidence = 0.90
        recommended_action = RecoveryAction.RETRY_PAYMENT
        reasoning = "The network connection timed out during processing. Since this is a temporary routing error, a retry is highly likely to succeed."
        
    elif "limit_exceeded" in reason or "LIMIT_EXCEEDED" in code:
        diagnosis = "The transaction was declined because it exceeds the card's single transaction or daily/monthly spending limit."
        confidence = 0.90
        recommended_action = RecoveryAction.SEND_PAYMENT_LINK
        reasoning = f"Declined with limits error. The transaction amount of {amount} exceeded the customer's account/card boundaries."
        
    elif not reason and case_type == "checkout_abandoned":
        diagnosis = "The customer abandoned the checkout flow after creating an order, without making any payment attempts."
        confidence = 0.80
        recommended_action = RecoveryAction.SEND_REMINDER
        reasoning = f"The order is in failed/pending status but has 0 associated payment attempts. The customer risk score is {risk_score:.2f}, indicating standard drop-off."
        
    return {
        "diagnosis": diagnosis,
        "confidence": confidence,
        "recommended_action": recommended_action,
        "reasoning": reasoning
    }


def get_ai_diagnosis(customer_info: dict, payment_info: dict, subscription_info: dict) -> dict:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    
    prompt = f"""
You are an expert payment intelligence analyst for an e-commerce and subscription system.
Analyze the following customer history and payment failure context to diagnose the failure and recommend a recovery strategy.

CUSTOMER HISTORY:
{json.dumps(customer_info, indent=2)}

PAYMENT/ORDER CONTEXT:
{json.dumps(payment_info, indent=2)}

SUBSCRIPTION CONTEXT:
{json.dumps(subscription_info, indent=2)}

Your output must be a structured JSON object matching the requested schema.
"""
    
    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=AIDiagnosisSchema,
                ),
            )
            result = json.loads(response.text)
            return result
        except Exception as e:
            print(f"Warning: Gemini API call failed: {e}. Falling back to rule-based diagnoser.")
            
    return get_rule_based_diagnosis(payment_info, customer_info)


def run_diagnosis_cycle(db: Session):
    open_cases_without_diag = db.query(RecoveryCase).filter(
        RecoveryCase.status == "open",
        RecoveryCase.diagnosis.is_(None)
    ).all()
    
    if not open_cases_without_diag:
        return
        
    print(f"Running AI Diagnosis for {len(open_cases_without_diag)} undiagnosed open cases...")
    
    for case in open_cases_without_diag:
        customer = db.query(Customer).filter(Customer.id == case.customer_id).first()
        payment = db.query(Payment).filter(Payment.id == case.payment_id).first() if case.payment_id else None
        subscription = db.query(Subscription).filter(Subscription.id == case.subscription_id).first() if case.subscription_id else None
        
        customer_info = {
            "name": customer.name if customer else "Unknown",
            "email": customer.email if customer else "Unknown",
            "risk_score": customer.risk_score if customer else 0.5,
            "status": customer.status if customer else "active"
        }
        
        payment_info = {
            "type": case.type,
            "amount": float(case.amount),
            "currency": case.currency,
            "payment_method": payment.payment_method if payment else "N/A",
            "failure_reason": payment.failure_reason if payment else "N/A",
            "error_code": payment.error_code if payment else "N/A",
            "retry_count": payment.retry_count if payment else 0
        }
        
        subscription_info = {
            "plan_name": subscription.plan_name if subscription else "N/A",
            "interval": subscription.interval if subscription else "N/A",
            "status": subscription.status if subscription else "N/A"
        }
        
        diag_data = get_ai_diagnosis(customer_info, payment_info, subscription_info)
        
        case.diagnosis = diag_data.get("diagnosis")
        case.confidence = diag_data.get("confidence")
        case.recommended_action = diag_data.get("recommended_action")
        case.reasoning = diag_data.get("reasoning")
        
        # Policy safety engine validation
        policy_res = evaluate_policy(case, customer, payment, case.recommended_action)
        case.policy_status = policy_res["status"]
        case.policy_reason = policy_res["reason"]
        
        # Write diagnosis, decided action, and policy check logs
        log_audit_event(db, case.id, "diagnosed", "success", message=f"AI Diagnosis completed: {case.diagnosis} (Confidence: {int(case.confidence*100)}%)")
        log_audit_event(db, case.id, "decided", "success", action=case.recommended_action, message=f"Recommended recovery action decided: {case.recommended_action}.")
        log_audit_event(
            db, 
            case.id, 
            "policy-checked", 
            "blocked" if case.policy_status == "BLOCKED" else ("needs_human" if case.policy_status == "NEEDS_HUMAN" else "success"), 
            action=case.recommended_action, 
            message=f"Policy Safety Engine check: {case.policy_status}. Reason: {case.policy_reason}"
        )
        
        print(f"Policy Decision for Case {case.id}: {case.policy_status} (Reason: {case.policy_reason})")
        
    db.commit()


if __name__ == "__main__":
    run_detector()

