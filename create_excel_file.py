"""
Script to create a sample Excel file with product inventory data
"""
import pandas as pd
from datetime import datetime, timedelta
import random

# Set random seed for reproducibility
random.seed(42)

# Create sample data
products = []
categories = ['Electronics', 'Furniture', 'Office Supplies', 'Software', 'Hardware']
warehouses = ['Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D']
statuses = ['In Stock', 'Low Stock', 'Out of Stock', 'On Order']

for i in range(1, 51):
    product = {
        'Product ID': f'PROD{i:04d}',
        'Product Name': f'Product {i}',
        'Category': random.choice(categories),
        'Quantity': random.randint(0, 500),
        'Unit Price': round(random.uniform(10, 1000), 2),
        'Warehouse': random.choice(warehouses),
        'Status': random.choice(statuses),
        'Supplier': f'Supplier {random.randint(1, 10)}',
        'Last Restock Date': (datetime.now() - timedelta(days=random.randint(1, 90))).strftime('%Y-%m-%d'),
        'Reorder Level': random.randint(10, 50)
    }
    products.append(product)

# Create DataFrame
df = pd.DataFrame(products)

# Create Excel file with multiple sheets
with pd.ExcelWriter('sample_inventory.xlsx', engine='openpyxl') as writer:
    # Main inventory sheet
    df.to_excel(writer, sheet_name='Inventory', index=False)
    
    # Summary by category
    summary = df.groupby('Category').agg({
        'Quantity': 'sum',
        'Unit Price': 'mean',
        'Product ID': 'count'
    }).round(2)
    summary.columns = ['Total Quantity', 'Avg Price', 'Product Count']
    summary.to_excel(writer, sheet_name='Category Summary')
    
    # Low stock items
    low_stock = df[df['Status'].isin(['Low Stock', 'Out of Stock'])][
        ['Product ID', 'Product Name', 'Category', 'Quantity', 'Status', 'Warehouse']
    ]
    low_stock.to_excel(writer, sheet_name='Low Stock Alert', index=False)

print("✅ Excel file 'sample_inventory.xlsx' created successfully!")
print(f"   - {len(df)} products in main inventory")
print(f"   - {len(low_stock)} low stock items")
print(f"   - 3 sheets: Inventory, Category Summary, Low Stock Alert")
