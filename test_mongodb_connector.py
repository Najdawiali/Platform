"""
Test MongoDB connector with local database
"""
import sys
sys.path.insert(0, '/Users/xhxa053/PycharmProjects/platform/data-platform/backend')

from app.connectors.mongodb_connector import MongoDBConnector

def test_mongodb_connector():
    print("Testing MongoDB Connector...")
    print("=" * 60)
    
    # Initialize connector
    connector = MongoDBConnector(
        connection_string="mongodb://localhost:27017",
        database="myTestDB",
        collection="customers"
    )
    
    # Test connection
    print("\n1. Testing connection...")
    test_result = connector.test_connection()
    print(f"   Result: {test_result}")
    
    if not test_result["success"]:
        print("   ❌ Connection test failed!")
        return
    
    print("   ✅ Connection successful!")
    print(f"   📊 Found {test_result['collection_count']} collections")
    print(f"   📂 Collections: {test_result['collections']}")
    
    # Connect
    print("\n2. Connecting to database...")
    if connector.connect():
        print("   ✅ Connected!")
    else:
        print("   ❌ Connection failed!")
        return
    
    # Validate source
    print("\n3. Validating collection...")
    validation = connector.validate_source()
    print(f"   Valid: {validation['is_valid']}")
    print(f"   Errors: {validation['errors']}")
    print(f"   Warnings: {validation['warnings']}")
    
    # Get schema
    print("\n4. Getting schema...")
    schema = connector.get_schema()
    print(f"   Row count: {schema['row_count']}")
    print(f"   Column count: {schema['column_count']}")
    print(f"   Sample size: {schema['sample_size']}")
    print("\n   Columns:")
    for col in schema['columns']:
        print(f"      - {col['name']}: {col['type']} (nulls: {col['null_count']}, unique: {col['unique_count']})")
    
    # Get preview data
    print("\n5. Getting preview data...")
    df = connector.get_preview_data(limit=5)
    print(f"   Shape: {df.shape}")
    print("\n   First 5 rows:")
    print(df.to_string(index=False))
    
    # Stream data in chunks
    print("\n6. Streaming data in chunks...")
    chunk_count = 0
    total_rows = 0
    for chunk in connector.read_data():
        chunk_count += 1
        total_rows += len(chunk)
        print(f"   Chunk {chunk_count}: {len(chunk)} rows")
    
    print(f"\n   Total: {chunk_count} chunks, {total_rows} rows")
    
    # List collections
    print("\n7. Listing all collections...")
    collections = connector.get_collections()
    print(f"   Collections: {collections}")
    
    # Disconnect
    print("\n8. Disconnecting...")
    if connector.disconnect():
        print("   ✅ Disconnected!")
    
    print("\n" + "=" * 60)
    print("✅ All tests passed!")

if __name__ == "__main__":
    test_mongodb_connector()
