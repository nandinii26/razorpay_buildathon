import os
import uuid
import razorpay
from datetime import datetime
from fastapi import FastAPI, Depends, Query, Request, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from decimal import Decimal

from .config import settings
from .database import get_db
from .models import Customer, Order, Payment, Subscription, RecoveryCase, AuditLog
from .schemas import CustomerSchema, PaymentSchema, PaymentWithCustomer, RecoveryStats, RecoveryCaseWithCustomer

app = FastAPI(title="AI Revenue Recovery API")

# Enable CORS so Next.js frontend can communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/stats", response_model=RecoveryStats)
def get_stats(db: Session = Depends(get_db)):
    # Total payment count & amount
    total_stats = db.query(
        func.count(Payment.id),
        func.sum(Payment.amount)
    ).first()
    total_count = total_stats[0] or 0
    total_amount = total_stats[1] or Decimal("0.00")

    # Succeeded payments
    succeeded_stats = db.query(
        func.count(Payment.id),
        func.sum(Payment.amount)
    ).filter(Payment.status == "succeeded").first()
    succeeded_count = succeeded_stats[0] or 0
    succeeded_amount = succeeded_stats[1] or Decimal("0.00")

    # Failed payments
    failed_stats = db.query(
        func.count(Payment.id),
        func.sum(Payment.amount)
    ).filter(Payment.status == "failed").first()
    failed_count = failed_stats[0] or 0
    failed_amount = failed_stats[1] or Decimal("0.00")

    # Read revenue at risk and recovered revenue directly from the recovery_cases table
    revenue_at_risk = db.query(func.sum(RecoveryCase.amount)).filter(
        RecoveryCase.status == "open"
    ).scalar() or Decimal("0.00")

    recovered_revenue = db.query(func.sum(RecoveryCase.amount)).filter(
        RecoveryCase.status == "recovered"
    ).scalar() or Decimal("0.00")

    failure_rate = (failed_count / total_count * 100) if total_count > 0 else 0.0
    
    # Recovery rate: recovered count / (total first-attempt failures)
    total_failures_ever = db.query(func.count(Payment.id)).filter(
        Payment.status == "failed",
        Payment.retry_count == 0
    ).scalar() or 0
    
    recovered_count = db.query(func.count(Payment.id)).filter(
        Payment.status == "succeeded",
        Payment.retry_count > 0
    ).scalar() or 0
    
    recovery_rate = (recovered_count / total_failures_ever * 100) if total_failures_ever > 0 else 0.0

    # New stats calculations for Phase 7
    total_cases_count = db.query(func.count(RecoveryCase.id)).scalar() or 0
    open_cases_count = db.query(func.count(RecoveryCase.id)).filter(RecoveryCase.status == "open").scalar() or 0
    recovered_cases_count = db.query(func.count(RecoveryCase.id)).filter(RecoveryCase.status == "recovered").scalar() or 0
    needs_human_cases_count = db.query(func.count(RecoveryCase.id)).filter(RecoveryCase.policy_status == "NEEDS_HUMAN").scalar() or 0
    blocked_cases_count = db.query(func.count(RecoveryCase.id)).filter(RecoveryCase.policy_status == "BLOCKED").scalar() or 0
    failed_to_recover_cases_count = db.query(func.count(RecoveryCase.id)).filter(RecoveryCase.status == "failed_to_recover").scalar() or 0

    breakdown_by_risk_type = {
        "payment_failure": {"count": 0, "amount": 0.0},
        "subscription_renewal_failure": {"count": 0, "amount": 0.0},
        "checkout_abandoned": {"count": 0, "amount": 0.0}
    }
    types_stats = db.query(
        RecoveryCase.type,
        func.count(RecoveryCase.id),
        func.sum(RecoveryCase.amount)
    ).group_by(RecoveryCase.type).all()

    for r_type, count, amt in types_stats:
        if r_type in breakdown_by_risk_type:
            breakdown_by_risk_type[r_type] = {
                "count": count or 0,
                "amount": float(amt or 0.0)
            }

    return RecoveryStats(
        total_revenue=succeeded_amount,
        recovered_revenue=recovered_revenue,
        revenue_at_risk=revenue_at_risk,
        total_payments_count=total_count,
        failed_payments_count=failed_count,
        success_payments_count=succeeded_count,
        failure_rate_percent=round(failure_rate, 2),
        recovery_rate_percent=round(recovery_rate, 2),
        total_cases_count=total_cases_count,
        open_cases_count=open_cases_count,
        recovered_cases_count=recovered_cases_count,
        needs_human_cases_count=needs_human_cases_count,
        blocked_cases_count=blocked_cases_count,
        failed_to_recover_cases_count=failed_to_recover_cases_count,
        breakdown_by_risk_type=breakdown_by_risk_type
    )

@app.get("/api/payments", response_model=List[PaymentWithCustomer])
def get_payments(
    status: Optional[str] = None,
    failure_reason: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Payment).join(Customer)
    
    if status:
        query = query.filter(Payment.status == status)
    if failure_reason:
        query = query.filter(Payment.failure_reason == failure_reason)
    if search:
        query = query.filter(
            (Customer.name.ilike(f"%{search}%")) | 
            (Customer.email.ilike(f"%{search}%"))
        )
        
    payments = query.order_by(Payment.created_at.desc()).offset(offset).limit(limit).all()
    return payments

@app.get("/api/customers", response_model=List[CustomerSchema])
def get_customers(
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Customer)
    
    if status:
        query = query.filter(Customer.status == status)
        
    if risk_level:
        if risk_level == "high":
            query = query.filter(Customer.risk_score >= 0.7)
        elif risk_level == "medium":
            query = query.filter(Customer.risk_score >= 0.3, Customer.risk_score < 0.7)
        elif risk_level == "low":
            query = query.filter(Customer.risk_score < 0.3)
            
    if search:
        query = query.filter(
            (Customer.name.ilike(f"%{search}%")) | 
            (Customer.email.ilike(f"%{search}%"))
        )
        
    customers = query.order_by(Customer.risk_score.desc()).offset(offset).limit(limit).all()
    return customers


@app.get("/api/recovery-cases", response_model=List[RecoveryCaseWithCustomer])
def get_recovery_cases(
    status: Optional[str] = None,
    type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(RecoveryCase).join(Customer)
    
    if status:
        query = query.filter(RecoveryCase.status == status)
    if type:
        query = query.filter(RecoveryCase.type == type)
    if search:
        query = query.filter(
            (Customer.name.ilike(f"%{search}%")) | 
            (Customer.email.ilike(f"%{search}%"))
        )
        
    cases = query.order_by(RecoveryCase.created_at.desc()).offset(offset).limit(limit).all()
    return cases


@app.post("/api/run-detector")
def run_detector_endpoint(db: Session = Depends(get_db)):
    from .detector import detect_recovery_cases
    detect_recovery_cases(db)
    return {"status": "success", "message": "Detector completed running successfully"}


@app.post("/api/simulate-failure")
def simulate_failure_endpoint(db: Session = Depends(get_db)):
    import random
    import uuid
    # Find a random customer
    customer = db.query(Customer).order_by(func.random()).first()
    if not customer:
        return {"status": "error", "message": "No customers found"}
        
    # Generate random amount
    amount = Decimal(str(round(random.uniform(20.0, 450.0), 2)))
    
    # Create failed order
    order = Order(
        id=uuid.uuid4(),
        customer_id=customer.id,
        amount=amount,
        currency="USD",
        status="failed",
        created_at=datetime.utcnow()
    )
    db.add(order)
    db.flush()  # get order id
    
    # Create failed payment
    payment = Payment(
        id=uuid.uuid4(),
        order_id=order.id,
        customer_id=customer.id,
        amount=amount,
        currency="USD",
        status="failed",
        payment_method=random.choice(["card", "upi", "netbanking"]),
        failure_reason=random.choice(["insufficient_funds", "limit_exceeded", "network_error"]),
        retry_count=0,
        created_at=datetime.utcnow(),
        error_code="ERR_SIMULATED_FAIL"
    )
    db.add(payment)
    db.commit()
    
    # Run detector to pick up the new case
    from .detector import detect_recovery_cases
    detect_recovery_cases(db)
    
    return {
        "status": "success", 
        "customer_name": customer.name, 
        "amount": amount
    }


@app.post("/api/recovery-cases/{case_id}/execute")
def execute_action_endpoint(
    case_id: str, 
    simulate_failure: bool = Query(False),
    db: Session = Depends(get_db)
):
    import uuid
    from .executor import execute_recovery_action
    
    case_uuid = uuid.UUID(case_id)
    case = db.query(RecoveryCase).filter(RecoveryCase.id == case_uuid).first()
    if not case:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Recovery case not found")
        
    return execute_recovery_action(db, case, simulate_failure)


@app.post("/api/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    body = await request.body()
    body_str = body.decode("utf-8")

    # 1. Verify Webhook Signature if Secret & Signature are present
    if settings.RAZORPAY_WEBHOOK_SECRET and x_razorpay_signature:
        try:
            client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
            client.utility.verify_webhook_signature(
                body_str, 
                x_razorpay_signature, 
                settings.RAZORPAY_WEBHOOK_SECRET
            )
        except Exception as e:
            print(f"Webhook signature verification failed: {e}")
            raise HTTPException(status_code=400, detail="Invalid Razorpay webhook signature")
    elif settings.RAZORPAY_WEBHOOK_SECRET and not x_razorpay_signature:
        raise HTTPException(status_code=400, detail="Missing X-Razorpay-Signature header")

    try:
        event_data = await request.json()
    except Exception:
        event_data = {}

    event_type = event_data.get("event")
    print(f"Received Razorpay Webhook Event: {event_type}")

    # 2. Handle Payment Link Paid Event
    if event_type in ["payment_link.paid", "order.paid", "payment.captured"]:
        payload = event_data.get("payload", {})
        plink_entity = payload.get("payment_link", {}).get("entity", {})
        payment_entity = payload.get("payment", {}).get("entity", {})
        
        # Look for case_id in notes
        case_id = (
            plink_entity.get("notes", {}).get("case_id") or
            payment_entity.get("notes", {}).get("case_id")
        )

        payment_id = payment_entity.get("id") or plink_entity.get("payment_id") or "rzp_test_pay"

        if case_id:
            try:
                case_uuid = uuid.UUID(case_id)
                case = db.query(RecoveryCase).filter(RecoveryCase.id == case_uuid).first()
                if case:
                    if case.status != "recovered":
                        case.status = "recovered"
                        case.updated_at = datetime.utcnow()
                    
                    # Log audit trail for webhook event
                    log = AuditLog(
                        id=uuid.uuid4(),
                        case_id=case.id,
                        step="resolved",
                        status="recovered",
                        action="PAYMENT_LINK_PAID",
                        message=f"Razorpay Webhook ({event_type}): Payment completed successfully. Payment ID: {payment_id}."
                    )
                    db.add(log)
                    db.commit()
                    print(f"Case #{case_id} marked as recovered via Webhook.")
            except Exception as e:
                print(f"Error processing recovery case #{case_id} in webhook: {e}")

    elif event_type == "payment.failed":
        payload = event_data.get("payload", {})
        payment_entity = payload.get("payment", {}).get("entity", {})
        case_id = payment_entity.get("notes", {}).get("case_id")
        
        if case_id:
            try:
                case_uuid = uuid.UUID(case_id)
                case = db.query(RecoveryCase).filter(RecoveryCase.id == case_uuid).first()
                if case:
                    error_desc = payment_entity.get("error_description", "Payment failed")
                    log = AuditLog(
                        id=uuid.uuid4(),
                        case_id=case.id,
                        step="executed",
                        status="failed",
                        action="WEBHOOK_PAYMENT_FAILED",
                        message=f"Razorpay Webhook: Payment failed. Reason: {error_desc}."
                    )
                    db.add(log)
                    db.commit()
            except Exception as e:
                print(f"Error logging failed payment for case #{case_id}: {e}")

    return {"status": "success", "event": event_type}


@app.get("/", response_class=HTMLResponse)
def get_dashboard():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(current_dir, "templates", "dashboard.html")
    with open(template_path, "r", encoding="utf-8") as f:
        content = f.read()
    return HTMLResponse(content=content)

