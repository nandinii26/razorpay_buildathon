from enum import Enum

class RecoveryAction(str, Enum):
    RETRY_PAYMENT = "RETRY_PAYMENT"
    SEND_PAYMENT_LINK = "SEND_PAYMENT_LINK"
    SEND_REMINDER = "SEND_REMINDER"
    RETRY_SUBSCRIPTION = "RETRY_SUBSCRIPTION"
    ESCALATE_TO_HUMAN = "ESCALATE_TO_HUMAN"
    STOP = "STOP"

def evaluate_policy(case, customer, payment, recommended_action: str) -> dict:
    """
    Evaluates safety and policy rules for a recommended action.
    Returns:
        dict: {"status": "APPROVED" | "BLOCKED" | "NEEDS_HUMAN", "reason": str}
    """
    amount = float(case.amount)
    case_type = case.type
    
    # 1. OPT-OUT CHECK
    # Opted-out customers must not receive automated outreach emails or links
    if customer and getattr(customer, "is_opted_out", False):
        if recommended_action in [RecoveryAction.SEND_PAYMENT_LINK, RecoveryAction.SEND_REMINDER]:
            return {
                "status": "BLOCKED",
                "reason": "Customer has opted out of communication outreach. Automated messages are suppressed."
            }

    # 2. MAX RETRIES CHECK
    # If the transaction has already failed multiple times, do not trigger automatic retries
    if payment and getattr(payment, "retry_count", 0) >= 3:
        if recommended_action in [RecoveryAction.RETRY_PAYMENT, RecoveryAction.RETRY_SUBSCRIPTION]:
            return {
                "status": "NEEDS_HUMAN",
                "reason": f"Payment retry limit exceeded (Retry count: {payment.retry_count}). Requires human intervention."
            }

    # 3. HIGH AMOUNT THRESHOLD Check
    # High-value recovery cases (> ₹50k) require human-in-the-loop review
    if amount > 50000.0:
        if recommended_action != RecoveryAction.STOP:
            return {
                "status": "NEEDS_HUMAN",
                "reason": f"High-value transaction at risk (₹{amount:,.2f} > ₹50,000.00). Requires manual review."
            }

    # 4. ALLOWED ACTION WHITELIST Check
    # Ensure the recommended recovery action matches case type capabilities
    if case_type == "checkout_abandoned":
        # Checkout abandoned cannot trigger auto payment retries (no card/gateway auth on file yet)
        allowed = [RecoveryAction.SEND_REMINDER, RecoveryAction.ESCALATE_TO_HUMAN, RecoveryAction.STOP]
        if recommended_action not in allowed:
            return {
                "status": "BLOCKED",
                "reason": f"Action {recommended_action} is invalid for checkout abandonment (no payment credentials exist)."
            }
            
    elif case_type == "payment_failure":
        # Cannot retry subscription for non-subscription checkout failures
        allowed = [RecoveryAction.RETRY_PAYMENT, RecoveryAction.SEND_PAYMENT_LINK, RecoveryAction.SEND_REMINDER, RecoveryAction.ESCALATE_TO_HUMAN, RecoveryAction.STOP]
        if recommended_action not in allowed:
            return {
                "status": "BLOCKED",
                "reason": f"Action {recommended_action} is invalid for standard payment failure."
            }

    # If it passes all safety policies, approve it
    return {
        "status": "APPROVED",
        "reason": "AI recommendation complies with all automated recovery policies."
    }
