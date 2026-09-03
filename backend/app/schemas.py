from pydantic import BaseModel, EmailStr
from datetime import datetime
from uuid import UUID
from decimal import Decimal
from typing import Optional, List

# Customer Schemas
class CustomerBase(BaseModel):
    name: str
    email: EmailStr
    risk_score: float = 0.0
    status: str = "active"
    is_opted_out: bool = False

class CustomerCreate(CustomerBase):
    pass

class CustomerSchema(CustomerBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# Order Schemas
class OrderBase(BaseModel):
    customer_id: UUID
    amount: Decimal
    currency: str = "USD"
    status: str

class OrderCreate(OrderBase):
    pass

class OrderSchema(OrderBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# Payment Schemas
class PaymentBase(BaseModel):
    order_id: Optional[UUID] = None
    customer_id: UUID
    amount: Decimal
    currency: str = "USD"
    status: str
    payment_method: str
    failure_reason: Optional[str] = None
    retry_count: int = 0
    error_code: Optional[str] = None

class PaymentCreate(PaymentBase):
    pass

class PaymentSchema(PaymentBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# Subscription Schemas
class SubscriptionBase(BaseModel):
    customer_id: UUID
    status: str
    plan_name: str
    amount: Decimal
    currency: str = "USD"
    interval: str
    current_period_start: datetime
    current_period_end: datetime
    canceled_at: Optional[datetime] = None

class SubscriptionCreate(SubscriptionBase):
    pass

class SubscriptionSchema(SubscriptionBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# Stats Schemas
class RecoveryStats(BaseModel):
    total_revenue: Decimal
    recovered_revenue: Decimal
    revenue_at_risk: Decimal
    total_payments_count: int
    failed_payments_count: int
    success_payments_count: int
    failure_rate_percent: float
    recovery_rate_percent: float
    total_cases_count: int
    open_cases_count: int
    recovered_cases_count: int
    needs_human_cases_count: int
    blocked_cases_count: int
    failed_to_recover_cases_count: int
    breakdown_by_risk_type: dict

# Summary Schemas
class PaymentWithCustomer(PaymentSchema):
    customer: CustomerSchema

    class Config:
        from_attributes = True


# Recovery Case Schemas
class RecoveryCaseBase(BaseModel):
    customer_id: UUID
    order_id: Optional[UUID] = None
    payment_id: Optional[UUID] = None
    subscription_id: Optional[UUID] = None
    type: str  # payment_failure, checkout_abandoned, subscription_renewal_failure
    amount: Decimal
    currency: str = "USD"
    status: str = "open"  # open, recovered, failed_to_recover
    risk_score: float = 0.0
    diagnosis: Optional[str] = None
    confidence: Optional[float] = None
    recommended_action: Optional[str] = None
    reasoning: Optional[str] = None
    policy_status: Optional[str] = None
    policy_reason: Optional[str] = None

class AuditLogSchema(BaseModel):
    id: UUID
    case_id: UUID
    step: str
    status: str
    action: Optional[str] = None
    message: str
    created_at: datetime

    class Config:
        from_attributes = True

class RecoveryCaseCreate(RecoveryCaseBase):
    pass

class RecoveryCaseSchema(RecoveryCaseBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    audit_logs: List[AuditLogSchema] = []

    class Config:
        from_attributes = True

class RecoveryCaseWithCustomer(RecoveryCaseSchema):
    customer: CustomerSchema

    class Config:
        from_attributes = True

