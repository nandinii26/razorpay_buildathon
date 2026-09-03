import random
import pandas as pd
from faker import Faker

fake = Faker()

# Number of cases we want
NUM_CASES = 10000

failure_reasons = [
    "TIMEOUT",
    "BANK_ERROR",
    "INSUFFICIENT_FUNDS",
    "NETWORK_ERROR",
    "CARD_DECLINED"
]

def determine_expected_action(
    amount,
    retry_count,
    previous_success_rate,
    checkout_abandoned,
    days_overdue,
    failure_reason
):
    # 1. Hard Safety Limits
    if retry_count >= 3:
        return "STOP"

    if amount > 50000 or days_overdue >= 30:
        return "ESCALATE_HUMAN"

    # 2. Abandoned checkout with no card on file -> Send Payment Link
    if checkout_abandoned:
        return "SEND_PAYMENT_LINK"

    # 3. Decision based on failure reason & customer history
    # Card declined or insufficient funds: retrying immediately will fail again; send link or reminder
    if failure_reason in ["INSUFFICIENT_FUNDS", "CARD_DECLINED"]:
        if amount > 25000 and random.random() < 0.30:
            return "ESCALATE_HUMAN"
        return "SEND_PAYMENT_LINK"

    # Temporary network or bank timeout: high success rate customers should be retried automatically
    if failure_reason in ["TIMEOUT", "BANK_ERROR", "NETWORK_ERROR"]:
        if previous_success_rate >= 0.75:
            return "RETRY_PAYMENT"
        elif previous_success_rate >= 0.50:
            # Borderline customers: 60% chance retry, 40% chance payment link
            return "RETRY_PAYMENT" if random.random() < 0.60 else "SEND_PAYMENT_LINK"
        else:
            return "SEND_PAYMENT_LINK"

    # 4. Stochastic real-world noise (e.g. manual agent override or edge case behavior)
    if random.random() < 0.05:
        return random.choice(["SEND_PAYMENT_LINK", "RETRY_PAYMENT", "ESCALATE_HUMAN"])

    return "SEND_PAYMENT_LINK"


rows = []
random.seed(42)  # For reproducible dataset generation

for i in range(NUM_CASES):

    customer_id = f"CUST_{i+1:05d}"
    case_id = f"CASE_{i+1:05d}"

    amount = random.choice([
        499, 999, 1499, 2499, 4999,
        7999, 9999, 15000, 25000,
        50000, 75000, 100000
    ])

    payment_status = random.choice([
        "FAILED",
        "FAILED",
        "FAILED",
        "ABANDONED"
    ])

    failure_reason = "NONE" if payment_status == "ABANDONED" else random.choice(failure_reasons)

    retry_count = random.randint(0, 3)

    previous_success_rate = round(
        random.uniform(0.20, 1.00),
        2
    )

    days_overdue = random.choice([
        0, 0, 0, 5, 10, 15, 20, 30, 45
    ])

    checkout_abandoned = (
        payment_status == "ABANDONED"
    )

    expected_action = determine_expected_action(
        amount,
        retry_count,
        previous_success_rate,
        checkout_abandoned,
        days_overdue,
        failure_reason
    )

    rows.append({
        "case_id": case_id,
        "customer_id": customer_id,
        "customer_name": fake.name(),
        "amount": amount,
        "payment_status": payment_status,
        "failure_reason": failure_reason,
        "retry_count": retry_count,
        "previous_success_rate": previous_success_rate,
        "days_overdue": days_overdue,
        "checkout_abandoned": checkout_abandoned,
        "expected_action": expected_action
    })


df = pd.DataFrame(rows)

import os

# Save dataset
output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, "revenue_recovery_dataset.csv")

df.to_csv(output_path, index=False)

print("Dataset created successfully!")
print(f"Total cases: {len(df)}")
print()
print("Action distribution:")
print(df["expected_action"].value_counts())
print()
print("Saved to:")
print(output_path)