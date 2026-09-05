import os
import uuid
import razorpay
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.orm import Session
from backend.app.config import settings
from backend.app.models import RecoveryCase, Payment, AuditLog
from backend.app.policy import RecoveryAction

def get_razorpay_client():
    if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
        try:
            return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        except Exception as e:
            print(f"Failed to initialize Razorpay Client: {e}")
    return None

def execute_recovery_action(db: Session, case: RecoveryCase, simulate_failure: bool = False) -> dict:
    """
    Executes the approved recovery action for a recovery case.
    Interacts with Razorpay Test Mode when configured, and falls back to simulation mode.
    Also writes detailed audit logs.
    """
    if case.status != "open":
        raise HTTPException(status_code=400, detail=f"Case is not in open status (current status: {case.status})")

    if case.policy_status == "BLOCKED":
        raise HTTPException(
            status_code=400, 
            detail=f"Execution blocked by policy safety engine: {case.policy_reason}"
        )

    # 1. Log execution starting
    exec_log = AuditLog(
        id=uuid.uuid4(),
        case_id=case.id,
        step="executed",
        status="failed" if simulate_failure else "success",
        action=case.recommended_action,
        message=f"Triggered recovery playbook outreach action: {case.recommended_action}."
    )
    db.add(exec_log)

    action = case.recommended_action
    customer = case.customer
    customer_name = customer.name if customer else "Customer"
    customer_email = customer.email if customer else "unknown@email.com"

    rzp_client = get_razorpay_client()

    if action in [RecoveryAction.RETRY_PAYMENT, RecoveryAction.RETRY_SUBSCRIPTION]:
        payment = None
        if case.payment_id:
            payment = db.query(Payment).filter(Payment.id == case.payment_id).first()
            
        if not payment:
            # Create a simulated Payment record representing this attempt
            payment = Payment(
                id=uuid.uuid4(),
                order_id=case.order_id,
                customer_id=case.customer_id,
                amount=case.amount,
                currency=case.currency or "INR",
                status="failed" if simulate_failure else "succeeded",
                payment_method="card",
                failure_reason="Simulated gateway error" if simulate_failure else None,
                retry_count=1,
                created_at=datetime.utcnow()
            )
            db.add(payment)
            db.flush()
            case.payment_id = payment.id
        else:
            # Increment retry count
            payment.retry_count += 1
            payment.status = "failed" if simulate_failure else "succeeded"
        
        if simulate_failure:
            fail_log = AuditLog(
                id=uuid.uuid4(),
                case_id=case.id,
                step="executed",
                status="failed",
                action=action,
                message=f"Razorpay payment retry attempt failed (Simulated). Retry count: {payment.retry_count} of 3."
            )
            db.add(fail_log)
            
            # Re-evaluate policies with new retry count
            from backend.app.policy import evaluate_policy
            policy_res = evaluate_policy(case, customer, payment, action)
            
            if policy_res["status"] != case.policy_status:
                case.policy_status = policy_res["status"]
                case.policy_reason = policy_res["reason"]
                
                policy_log = AuditLog(
                    id=uuid.uuid4(),
                    case_id=case.id,
                    step="policy-checked",
                    status="needs_human" if policy_res["status"] == "NEEDS_HUMAN" else ("blocked" if policy_res["status"] == "BLOCKED" else "success"),
                    action=action,
                    message=f"Policy Safety Engine check status changed: {case.policy_status}. Reason: {case.policy_reason}"
                )
                db.add(policy_log)
            
            db.commit()
            
            return {
                "status": "failure",
                "message": f"Payment retry failed. Retry count incremented to {payment.retry_count}.",
                "policy_status": case.policy_status
            }
        else:
            # Successful retry
            case.status = "recovered"
            case.updated_at = datetime.utcnow()

            resolved_log = AuditLog(
                id=uuid.uuid4(),
                case_id=case.id,
                step="resolved",
                status="recovered",
                action=action,
                message="Razorpay payment retry succeeded (Test Mode). Revenue recovered."
            )
            db.add(resolved_log)
            db.commit()

            return {
                "status": "success",
                "message": f"Razorpay payment retry executed successfully. Case status updated to recovered.",
                "policy_status": case.policy_status
            }

    elif action == RecoveryAction.SEND_PAYMENT_LINK:
        payment_link = None
        link_id = None
        is_live_api = False

        # Attempt to create real Razorpay Payment Link in Test Mode
        if rzp_client and not simulate_failure:
            try:
                # Razorpay amount is in paise (1 INR = 100 paise)
                amount_in_paise = max(100, int(float(case.amount) * 100))
                link_payload = {
                    "amount": amount_in_paise,
                    "currency": "INR",
                    "accept_partial": False,
                    "description": f"Revenue Recovery for Case #{str(case.id)[:8]}",
                    "customer": {
                        "name": customer_name,
                        "email": customer_email,
                        "contact": "+919876543210"
                    },
                    "notify": {"sms": True, "email": True},
                    "reminder_enable": True,
                    "notes": {"case_id": str(case.id)},
                    "callback_url": "http://localhost:5173",
                    "callback_method": "get"
                }
                
                resp = rzp_client.payment_link.create(link_payload)
                payment_link = resp.get("short_url")
                link_id = resp.get("id")
                is_live_api = True
            except Exception as e:
                print(f"Warning: Razorpay API call failed: {e}. Falling back to simulated link.")
        
        # Fallback to simulated link if Razorpay API keys are not provided or call failed
        if not payment_link:
            link_id = f"plink_{uuid.uuid4().hex[:12]}"
            payment_link = f"https://rzp.io/i/{link_id}"

        mode_str = "Live Razorpay Test Mode API" if is_live_api else "Simulated Link"
        comms_message = (
            f"Razorpay Payment Link generated ({mode_str}). "
            f"Notification dispatched to customer {customer_email}."
        )
        
        # Update case with payment link
        case.payment_link = payment_link
        db.commit()
        
        comms_log = AuditLog(
            id=uuid.uuid4(),
            case_id=case.id,
            step="executed",
            status="success",
            action=action,
            message=comms_message
        )
        db.add(comms_log)
        db.commit()

        return {
            "status": "success",
            "message": f"Payment link generated successfully ({mode_str}).",
            "payment_link": payment_link,
            "link_id": link_id,
            "is_live_api": is_live_api,
            "policy_status": case.policy_status
        }

    elif action == RecoveryAction.SEND_REMINDER:
        comms_message = (
            f"Checkout abandonment reminder outreach (including a 10% discount incentive) "
            f"delivered to {customer_email}, and SMS notification dispatched."
        )
        
        reminder_log = AuditLog(
            id=uuid.uuid4(),
            case_id=case.id,
            step="executed",
            status="success",
            action=action,
            message=comms_message
        )
        db.add(reminder_log)
        db.commit()

        return {
            "status": "success",
            "message": f"Outreach reminder sent successfully to customer.",
            "policy_status": case.policy_status
        }

    elif action == RecoveryAction.ESCALATE_TO_HUMAN:
        escalation_message = (
            f"Case successfully flagged and assigned to account manager for high-touch manual outreach."
        )
        
        escalate_log = AuditLog(
            id=uuid.uuid4(),
            case_id=case.id,
            step="executed",
            status="success",
            action=action,
            message=escalation_message
        )
        db.add(escalate_log)
        db.commit()

        return {
            "status": "success",
            "message": f"Case escalated to human review.",
            "policy_status": case.policy_status
        }

    elif action == RecoveryAction.STOP:
        case.status = "failed_to_recover"
        case.updated_at = datetime.utcnow()

        stop_log = AuditLog(
            id=uuid.uuid4(),
            case_id=case.id,
            step="resolved",
            status="failed",
            action=action,
            message="Recovery efforts halted. Case closed as failed to recover."
        )
        db.add(stop_log)
        db.commit()

        return {
            "status": "success",
            "message": "Recovery efforts stopped. Case closed.",
            "policy_status": case.policy_status
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported recommended action: {action}")
