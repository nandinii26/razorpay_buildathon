import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer, Numeric, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    risk_score = Column(Float, default=0.0)  # 0.0 to 1.0 (calculated risk of churn/non-payment)
    status = Column(String, default="active")  # active, past_due, delinquent
    is_opted_out = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, nullable=False)

    # Relationships
    orders = relationship("Order", back_populates="customer", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="customer", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="customer", cascade="all, delete-orphan")
    recovery_cases = relationship("RecoveryCase", back_populates="customer", cascade="all, delete-orphan")

class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    status = Column(String, nullable=False)  # pending, completed, failed, cancelled
    created_at = Column(DateTime, nullable=False)

    # Relationships
    customer = relationship("Customer", back_populates="orders")
    payments = relationship("Payment", back_populates="order", cascade="all, delete-orphan")

class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    status = Column(String, nullable=False)  # succeeded, failed, processing, refunded
    payment_method = Column(String, nullable=False)  # card, upi, bank_transfer, netbanking
    failure_reason = Column(String, nullable=True)  # insufficient_funds, expired_card, authentication_failed, network_error, limit_exceeded, none
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, nullable=False)
    error_code = Column(String, nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="payments")
    order = relationship("Order", back_populates="payments")

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, nullable=False)  # active, past_due, canceled, unpaid
    plan_name = Column(String, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    interval = Column(String, nullable=False)  # month, year
    current_period_start = Column(DateTime, nullable=False)
    current_period_end = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False)
    canceled_at = Column(DateTime, nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="subscriptions")


class RecoveryCase(Base):
    __tablename__ = "recovery_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True)

    type = Column(String, nullable=False)  # payment_failure, checkout_abandoned, subscription_renewal_failure
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    status = Column(String, nullable=False, default="open")  # open, recovered, failed_to_recover
    risk_score = Column(Float, nullable=False, default=0.0)
    diagnosis = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    recommended_action = Column(String, nullable=True)
    reasoning = Column(String, nullable=True)
    policy_status = Column(String, nullable=True)  # APPROVED, BLOCKED, NEEDS_HUMAN
    policy_reason = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    customer = relationship("Customer", back_populates="recovery_cases")
    order = relationship("Order")
    payment = relationship("Payment")
    subscription = relationship("Subscription")
    audit_logs = relationship("AuditLog", back_populates="case", cascade="all, delete-orphan")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), ForeignKey("recovery_cases.id", ondelete="CASCADE"), nullable=False)
    step = Column(String, nullable=False)  # detected, diagnosed, decided, policy-checked, executed, resolved
    status = Column(String, nullable=False)  # success, blocked, failed, needs_human, recovered
    action = Column(String, nullable=True)  # RETRY_PAYMENT, SEND_PAYMENT_LINK, etc.
    message = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    case = relationship("RecoveryCase", back_populates="audit_logs")


