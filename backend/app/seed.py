import uuid
import random
from datetime import datetime, timedelta
from decimal import Decimal
from faker import Faker

from .database import engine, Base, SessionLocal
from .models import Customer, Order, Payment, Subscription

fake = Faker()

# Configuration
NUM_CUSTOMERS = 300
START_DATE = datetime.now() - timedelta(days=90) # 90 days of history

FAILURE_REASONS = [
    ("insufficient_funds", "ERR_INSUFFICIENT_FUNDS"),
    ("expired_card", "ERR_EXPIRED_CARD"),
    ("authentication_failed", "ERR_AUTH_FAILED"),
    ("network_error", "ERR_NETWORK_ERROR"),
    ("limit_exceeded", "ERR_LIMIT_EXCEEDED")
]

PAYMENT_METHODS = ["card", "upi", "bank_transfer", "netbanking"]

PLANS = [
    {"name": "Starter Plan", "amount": Decimal("29.00"), "interval": "month"},
    {"name": "Growth Plan", "amount": Decimal("79.00"), "interval": "month"},
    {"name": "Scale Plan", "amount": Decimal("199.00"), "interval": "month"},
    {"name": "Enterprise Plan", "amount": Decimal("999.00"), "interval": "month"}
]

def seed_db():
    print("Recreating database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print(f"Generating synthetic data starting from {START_DATE.date()}...")
        
        customers = []
        for _ in range(NUM_CUSTOMERS):
            created_at = START_DATE + timedelta(days=random.randint(0, 45))
            c = Customer(
                id=uuid.uuid4(),
                name=fake.name(),
                email=fake.unique.email(),
                status="active",
                risk_score=0.0,
                is_opted_out=random.random() < 0.10,  # 10% of customers opt-out
                created_at=created_at
            )
            customers.append(c)
            db.add(c)
        db.commit()

        print(f"Generated {len(customers)} customers.")

        total_orders = 0
        total_payments = 0
        total_subscriptions = 0

        for customer in customers:
            # Let's decide if this customer is a subscription customer or order-based customer
            is_subscriber = random.choice([True, False])
            
            # Risk factor for this specific customer (influences failure rates)
            # 10% of customers have high propensity for failures
            customer_failure_propensity = 0.85 if random.random() < 0.10 else 0.05

            if is_subscriber:
                # Add a subscription
                plan = random.choice(PLANS)
                sub_created_at = customer.created_at + timedelta(days=random.randint(0, 5))
                
                # Determine subscription status based on propensity
                sub_status = "active"
                risk_score = 0.0
                if customer_failure_propensity > 0.5:
                    sub_status = random.choice(["past_due", "unpaid", "canceled"])
                    risk_score = 0.7 if sub_status == "past_due" else (0.9 if sub_status == "unpaid" else 0.4)
                else:
                    if random.random() < 0.05:
                        sub_status = "canceled"
                        risk_score = 0.1

                customer.status = "delinquent" if sub_status == "unpaid" else ("past_due" if sub_status == "past_due" else "active")
                customer.risk_score = risk_score

                sub = Subscription(
                    id=uuid.uuid4(),
                    customer_id=customer.id,
                    status=sub_status,
                    plan_name=plan["name"],
                    amount=plan["amount"],
                    currency="USD",
                    interval=plan["interval"],
                    current_period_start=datetime.now() - timedelta(days=15),
                    current_period_end=datetime.now() + timedelta(days=15),
                    created_at=sub_created_at,
                    canceled_at=datetime.now() - timedelta(days=random.randint(1, 10)) if sub_status == "canceled" else None
                )
                db.add(sub)
                total_subscriptions += 1

                # Generate billing cycles/payments for subscription
                current_payment_date = sub_created_at
                while current_payment_date < datetime.now():
                    order = Order(
                        id=uuid.uuid4(),
                        customer_id=customer.id,
                        amount=plan["amount"],
                        currency="USD",
                        status="completed" if sub_status == "active" else "failed",
                        created_at=current_payment_date
                    )
                    db.add(order)
                    total_orders += 1

                    # Generate payment attempts for this billing cycle
                    create_payment_flow(db, customer, order, plan["amount"], current_payment_date, customer_failure_propensity)
                    
                    current_payment_date += timedelta(days=30)
            else:
                # Order-based customer
                num_orders = random.randint(1, 8)
                order_date = customer.created_at
                
                has_active_failure = False
                for _ in range(num_orders):
                    order_date += timedelta(days=random.randint(2, 15))
                    if order_date > datetime.now():
                        break

                    amount = Decimal(str(round(random.uniform(15.0, 350.0), 2)))
                    order_status = "completed"
                    will_fail = random.random() < customer_failure_propensity
                    
                    if will_fail:
                        order_status = "failed"
                        has_active_failure = True
                    
                    order = Order(
                        id=uuid.uuid4(),
                        customer_id=customer.id,
                        amount=amount,
                        currency="USD",
                        status=order_status,
                        created_at=order_date
                    )
                    db.add(order)
                    total_orders += 1

                    # Handle payments
                    resolved = create_payment_flow(db, customer, order, amount, order_date, customer_failure_propensity)
                    if resolved:
                        order.status = "completed"
                        has_active_failure = False
                    else:
                        order.status = "failed"

                # Set customer status & risk score
                if has_active_failure:
                    customer.status = "past_due"
                    customer.risk_score = min(1.0, customer_failure_propensity + 0.1)
                else:
                    customer.status = "active"
                    customer.risk_score = max(0.0, customer_failure_propensity - 0.05)

        # Generate some abandoned checkouts (failed orders with no payment attempts)
        total_abandoned = 0
        # Select some order-based customers randomly to simulate checkouts
        order_customers = [c for c in customers if c.status == "active"]
        abandoned_customers = random.sample(order_customers, min(20, len(order_customers)))
        for customer in abandoned_customers:
            created_at = START_DATE + timedelta(days=random.randint(10, 80))
            if created_at > datetime.now():
                continue
            amount = Decimal(str(round(random.uniform(25.0, 150.0), 2)))
            
            abandoned_order = Order(
                id=uuid.uuid4(),
                customer_id=customer.id,
                amount=amount,
                currency="USD",
                status="failed",  # Classified as failed order at risk, but no payments -> checkout_abandoned
                created_at=created_at
            )
            db.add(abandoned_order)
            total_abandoned += 1
            total_orders += 1
        db.commit()
        print(f"Generated {total_abandoned} abandoned checkouts.")
        print(f"Generated {total_orders} orders, {total_subscriptions} subscriptions.")
        
        # Verify payments table
        payment_count = db.query(Payment).count()
        failed_count = db.query(Payment).filter(Payment.status == "failed").count()
        success_count = db.query(Payment).filter(Payment.status == "succeeded").count()
        print(f"Seeded {payment_count} payments: {success_count} succeeded, {failed_count} failed.")

        # Run risk detector to populate recovery_cases
        print("Running risk detector to populate recovery_cases...")
        from .detector import detect_recovery_cases
        detect_recovery_cases(db)
        print("Successfully populated recovery_cases table!")

    except Exception as e:
        print(f"Error during seeding: {e}")
        db.rollback()
        raise e
    finally:
        db.close()

def create_payment_flow(db, customer, order, amount, date, failure_propensity):
    """
    Creates a payment attempt flow for an order.
    Returns True if payment eventually succeeds, False otherwise.
    """
    method = random.choice(PAYMENT_METHODS)
    first_attempt_failed = random.random() < failure_propensity
    
    if not first_attempt_failed:
        p = Payment(
            id=uuid.uuid4(),
            order_id=order.id,
            customer_id=customer.id,
            amount=amount,
            currency="USD",
            status="succeeded",
            payment_method=method,
            failure_reason="none",
            retry_count=0,
            created_at=date,
            error_code=None
        )
        db.add(p)
        return True
    
    reason, code = random.choice(FAILURE_REASONS)
    p_fail = Payment(
        id=uuid.uuid4(),
        order_id=order.id,
        customer_id=customer.id,
        amount=amount,
        currency="USD",
        status="failed",
        payment_method=method,
        failure_reason=reason,
        retry_count=0,
        created_at=date,
        error_code=code
    )
    db.add(p_fail)

    max_retries = random.randint(1, 3)
    retry_date = date
    
    for r in range(1, max_retries + 1):
        retry_date += timedelta(days=random.randint(1, 3))
        if retry_date > datetime.now():
            break
            
        if reason == "network_error":
            retry_success_prob = 0.85
        elif reason == "insufficient_funds":
            retry_success_prob = 0.40
        elif reason == "limit_exceeded":
            retry_success_prob = 0.50
        else:
            retry_success_prob = 0.15
            
        if failure_propensity < 0.1:
            retry_success_prob += 0.3
            
        retry_success = random.random() < retry_success_prob
        
        if retry_success:
            p_success = Payment(
                id=uuid.uuid4(),
                order_id=order.id,
                customer_id=customer.id,
                amount=amount,
                currency="USD",
                status="succeeded",
                payment_method=method if reason != "expired_card" else "card",
                failure_reason="none",
                retry_count=r,
                created_at=retry_date,
                error_code=None
            )
            db.add(p_success)
            return True
        else:
            new_reason, new_code = reason, code
            if reason != "expired_card":
                new_reason, new_code = random.choice(FAILURE_REASONS)
                
            p_fail_again = Payment(
                id=uuid.uuid4(),
                order_id=order.id,
                customer_id=customer.id,
                amount=amount,
                currency="USD",
                status="failed",
                payment_method=method,
                failure_reason=new_reason,
                retry_count=r,
                created_at=retry_date,
                error_code=new_code
            )
            db.add(p_fail_again)
            
    return False

if __name__ == "__main__":
    seed_db()
