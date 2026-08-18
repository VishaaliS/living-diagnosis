import pandas as pd
import os

def load_registry():
    # Load the CSV file into a pandas DataFrame
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(current_dir, 'guideline_changes.csv')
    try:
        df = pd.read_csv(csv_path)
        return df
    except Exception as e:
        print(f"Error loading registry: {e}")
        return None

# Exported registry DataFrame
REGISTRY_DF = load_registry()
