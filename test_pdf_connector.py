#!/usr/bin/env python3
"""
Test the PDF connector with the sample file
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

def test_pdf_connector():
    """Test the PDF connector"""
    from app.connectors.pdf_connector import PDFConnector
    
    print("=" * 60)
    print("Testing PDF Connector")
    print("=" * 60)
    
    file_path = "./sample_inventory.pdf"
    
    if not os.path.exists(file_path):
        print(f"❌ Error: Sample file not found at {file_path}")
        return False
    
    print(f"\n✅ Found sample file: {file_path}")
    print(f"   File size: {os.path.getsize(file_path)} bytes")
    
    try:
        print("\n📝 Creating PDFConnector...")
        connector = PDFConnector(file_path=file_path)
        
        print("🔌 Testing connection...")
        if not connector.connect():
            print("❌ Connection failed!")
            return False
        
        print("✅ Connection successful!")
        
        print("\n📊 Getting schema...")
        schema = connector.get_schema()
        print(f"   Rows: {schema['row_count']}")
        print(f"   Columns: {schema['column_count']}")
        print(f"   Column names: {', '.join([col['name'] for col in schema['columns']])}")
        
        print("\n📥 Fetching data (first 5 rows)...")
        df = connector.fetch_data(limit=5)
        print(f"\n{df}")
        
        print("\n✅ Testing validation...")
        validation = connector.validate_source()
        print(f"   Valid: {validation['is_valid']}")
        if validation['errors']:
            print(f"   Errors: {validation['errors']}")
        if validation['warnings']:
            print(f"   Warnings: {validation['warnings']}")
        
        connector.disconnect()
        print("\n✅ Test completed successfully!")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    try:
        success = test_pdf_connector()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
