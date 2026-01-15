"""
Simple line classifier using Random Forest.
"""

import os
import joblib
import numpy as np
from pathlib import Path
from typing import List, Optional
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder

from .features import extract_features, features_to_vector


class LineClassifier:
    """Classifies text lines as 'code', 'logs', 'text', or 'none'."""
    
    LABELS = ['code', 'logs', 'text', 'none']
    
    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize classifier. Loads model from path if provided and exists.
        """
        self.model = None
        self.label_encoder = LabelEncoder()
        self.label_encoder.fit(self.LABELS)
        
        if model_path is None:
            model_path = str(Path(__file__).parent / 'trained_model.pkl')
        
        if os.path.exists(model_path):
            self._load(model_path)
    
    def train(self, X: np.ndarray, y: List[str]) -> dict:
        """Train the classifier on feature matrix X and labels y."""
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=15,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
            class_weight='balanced'
        )
        y_encoded = self.label_encoder.transform(y)
        self.model.fit(X, y_encoded)
        return {'n_samples': len(y)}
    
    def predict(self, texts: List[str]) -> List[str]:
        """
        Classify a list of text lines.
        
        Args:
            texts: List of text lines to classify
            
        Returns:
            List of labels (same length as input)
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Train or load a model first.")
        
        X = np.array([features_to_vector(extract_features(t)) for t in texts])
        y_pred = self.model.predict(X)
        return list(self.label_encoder.inverse_transform(y_pred))
    
    def save(self, path: str):
        """Save model to disk."""
        joblib.dump({'model': self.model, 'label_encoder': self.label_encoder}, path)
    
    def _load(self, path: str):
        """Load model from disk."""
        data = joblib.load(path)
        self.model = data['model']
        self.label_encoder = data['label_encoder']


def classify_lines(lines: List[str], model_path: Optional[str] = None) -> List[str]:
    """
    Classify a list of text lines.
    
    Args:
        lines: List of text lines
        model_path: Optional path to model file
        
    Returns:
        List of classifications ('code', 'logs', 'text', 'none')
    """
    classifier = LineClassifier(model_path)
    return classifier.predict(lines)
