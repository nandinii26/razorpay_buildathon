import os
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

def train_recovery_model():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_path = os.path.join(base_dir, "data", "revenue_recovery_dataset.csv")
    model_save_path = os.path.join(base_dir, "data", "recovery_model.joblib")
    
    print("=" * 60)
    print("1. LOADING DATASET")
    print("=" * 60)
    df = pd.read_csv(dataset_path)
    print(f"Loaded {len(df)} samples from {dataset_path}")
    
    # 2. FEATURE SELECTION & SPLIT
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
    
    categorical_cols = ["payment_status", "failure_reason"]
    numeric_cols = ["amount", "retry_count", "previous_success_rate", "days_overdue", "checkout_abandoned"]
    
    # 80% Train, 20% Test (Stratified)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    print(f"Training samples: {len(X_train)} | Test samples: {len(X_test)}")
    
    # 3. BUILD PREPROCESSING & MODEL PIPELINE
    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_cols)
        ],
        remainder="passthrough"
    )
    
    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", RandomForestClassifier(
            n_estimators=150,
            max_depth=10,
            min_samples_split=5,
            random_state=42,
            n_jobs=-1
        ))
    ])
    
    # 4. TRAIN MODEL
    print("\n" + "=" * 60)
    print("2. TRAINING MACHINE LEARNING MODEL")
    print("=" * 60)
    pipeline.fit(X_train, y_train)
    print("Random Forest Classifier trained successfully.")
    
    # 5. EVALUATION ON TRAIN & TEST SETS
    train_preds = pipeline.predict(X_train)
    test_preds = pipeline.predict(X_test)
    
    train_acc = accuracy_score(y_train, train_preds)
    test_acc = accuracy_score(y_test, test_preds)
    
    print("\n" + "=" * 60)
    print("3. REALISTIC MODEL EVALUATION METRICS")
    print("=" * 60)
    print(f"Train Accuracy : {train_acc * 100:.2f}%")
    print(f"Test Accuracy  : {test_acc * 100:.2f}% (Realistic generalization on unseen data)")
    
    print("\n--- Detailed Test Classification Report ---")
    print(classification_report(y_test, test_preds, digits=4))
    
    labels = sorted(y.unique())
    cm = confusion_matrix(y_test, test_preds, labels=labels)
    cm_df = pd.DataFrame(cm, index=[f"Actual_{l}" for l in labels], columns=[f"Pred_{l}" for l in labels])
    print("--- Confusion Matrix ---")
    print(cm_df)
    
    # 6. FEATURE IMPORTANCE ANALYSIS
    fitted_preprocessor = pipeline.named_steps["preprocessor"]
    fitted_rf = pipeline.named_steps["classifier"]
    
    cat_feature_names = fitted_preprocessor.named_transformers_["cat"].get_feature_names_out(categorical_cols)
    all_feature_names = list(cat_feature_names) + numeric_cols
    importances = fitted_rf.feature_importances_
    
    feat_imp_df = pd.DataFrame({
        "Feature": all_feature_names,
        "Importance": importances
    }).sort_values(by="Importance", ascending=False)
    
    print("\n--- Top Feature Importances ---")
    print(feat_imp_df.head(8).to_string(index=False))
    
    # 7. SAVE MODEL ARTIFACT
    joblib.dump(pipeline, model_save_path)
    print(f"\nModel pipeline saved to: {model_save_path}")

if __name__ == "__main__":
    train_recovery_model()
