import os
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

base_dir = os.path.dirname(os.path.abspath(__file__))
dataset_path = os.path.join(base_dir, "data", "revenue_recovery_dataset.csv")
model_path = os.path.join(base_dir, "data", "recovery_model.joblib")

# ==========================================
# PART 1: DATASET HEALTH & SANITY CHECKS
# ==========================================
print("=" * 60)
print("PART 1: DATASET SANITY CHECKS")
print("=" * 60)

if not os.path.exists(dataset_path):
    raise FileNotFoundError(f"Dataset not found at {dataset_path}. Run generate_data.py first.")

df = pd.read_csv(dataset_path)
print(f"Total Rows: {len(df)}")
print(f"Missing Values:\n{df.isnull().sum()}")

print("\n--- Distribution of Expected Actions ---")
print(df["expected_action"].value_counts(normalize=True).apply(lambda x: f"{x*100:.2f}%"))

print("\n--- Distribution by Failure Reason ---")
print(df["failure_reason"].value_counts())

# ==========================================
# PART 2: LOAD TRAINED ML MODEL
# ==========================================
print("\n" + "=" * 60)
print("PART 2: LOAD & TEST TRAINED ML MODEL")
print("=" * 60)

if not os.path.exists(model_path):
    print("Trained model artifact not found. Training model now via train_model.py...")
    from train_model import train_recovery_model
    train_recovery_model()

model = joblib.load(model_path)
print(f"Loaded trained ML pipeline successfully from: {model_path}")

features = [
    "amount",
    "payment_status",
    "failure_reason",
    "retry_count",
    "previous_success_rate",
    "days_overdue",
    "checkout_abandoned"
]
target = "expected_action"

X = df[features]
y = df[target]

# Split into train/test to evaluate generalization on unseen data
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)

# Predict on test set
test_preds = model.predict(X_test)
test_probs = model.predict_proba(X_test)

# Overall Test Accuracy
test_acc = accuracy_score(y_test, test_preds)
print(f"\nRealistic Test Generalization Accuracy: {test_acc * 100:.2f}%\n")

# Detailed Classification Metrics
print("--- Classification Report (Unseen Test Data) ---")
print(classification_report(y_test, test_preds, digits=4))

# Confusion Matrix
labels = sorted(y.unique())
cm = confusion_matrix(y_test, test_preds, labels=labels)
cm_df = pd.DataFrame(cm, index=[f"Actual_{l}" for l in labels], columns=[f"Pred_{l}" for l in labels])
print("--- Confusion Matrix ---")
print(cm_df)

# ==========================================
# PART 3: ERROR & MISMATCH ANALYSIS
# ==========================================
test_results = X_test.copy()
test_results["expected_action"] = y_test
test_results["predicted_action"] = test_preds
test_results["confidence"] = np.max(test_probs, axis=1)

mismatches = test_results[test_results["expected_action"] != test_results["predicted_action"]]
print(f"\nTotal Test Mismatches: {len(mismatches)} / {len(X_test)} ({len(mismatches)/len(X_test)*100:.2f}%)")

if len(mismatches) > 0:
    print("\nSample Mismatches (First 5):")
    print(mismatches[["amount", "failure_reason", "retry_count", "days_overdue", "previous_success_rate", "expected_action", "predicted_action", "confidence"]].head())

# ==========================================
# PART 4: LIVE PREDICTION SAMPLE (INFERENCE)
# ==========================================
print("\n" + "=" * 60)
print("PART 4: SAMPLE LIVE INFERENCE")
print("=" * 60)

sample_case = pd.DataFrame([{
    "amount": 15000,
    "payment_status": "FAILED",
    "failure_reason": "TIMEOUT",
    "retry_count": 1,
    "previous_success_rate": 0.88,
    "days_overdue": 0,
    "checkout_abandoned": False
}])

pred_action = model.predict(sample_case)[0]
pred_proba = model.predict_proba(sample_case)[0]
class_idx = list(model.classes_).index(pred_action)

print(f"Sample Input: {sample_case.to_dict(orient='records')[0]}")
print(f"Recommended Action: {pred_action} (Confidence: {pred_proba[class_idx]*100:.1f}%)")
