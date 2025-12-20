#!/usr/bin/env python3
"""
Create a sample PDF with a table for testing the PDF connector
"""
import sys
import os

def create_sample_pdf():
    """Create a PDF with employee data table"""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
    except ImportError:
        print("❌ reportlab is required to create PDF files")
        print("Install it with: pip install reportlab")
        return False
    
    pdf_path = "sample_inventory.pdf"
    
    # Create the PDF document
    doc = SimpleDocTemplate(pdf_path, pagesize=letter)
    elements = []
    
    # Add title
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=30,
        alignment=1  # Center
    )
    
    title = Paragraph("Warehouse Inventory Report", title_style)
    elements.append(title)
    elements.append(Spacer(1, 0.3*inch))
    
    # Add subtitle
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#6b7280'),
        spaceAfter=20,
        alignment=1
    )
    subtitle = Paragraph("Q4 2024 - Updated December 15, 2024", subtitle_style)
    elements.append(subtitle)
    elements.append(Spacer(1, 0.3*inch))
    
    # Create table data
    data = [
        ['Item Code', 'Product Name', 'Category', 'Quantity', 'Unit Price', 'Total Value', 'Warehouse', 'Status'],
        ['INV-001', 'Laptop Dell XPS 15', 'Electronics', '45', '$1,299.00', '$58,455.00', 'Warehouse A', 'In Stock'],
        ['INV-002', 'Office Chair Pro', 'Furniture', '120', '$299.99', '$35,998.80', 'Warehouse B', 'In Stock'],
        ['INV-003', 'Wireless Mouse', 'Accessories', '350', '$29.99', '$10,496.50', 'Warehouse A', 'In Stock'],
        ['INV-004', 'Monitor 27 inch 4K', 'Electronics', '78', '$449.00', '$35,022.00', 'Warehouse A', 'In Stock'],
        ['INV-005', 'Standing Desk', 'Furniture', '34', '$599.99', '$20,399.66', 'Warehouse B', 'Low Stock'],
        ['INV-006', 'Mechanical Keyboard', 'Accessories', '210', '$129.99', '$27,297.90', 'Warehouse A', 'In Stock'],
        ['INV-007', 'USB-C Hub 7-Port', 'Accessories', '180', '$49.99', '$8,998.20', 'Warehouse C', 'In Stock'],
        ['INV-008', 'Webcam HD 1080p', 'Electronics', '95', '$79.99', '$7,599.05', 'Warehouse A', 'In Stock'],
        ['INV-009', 'Desk Lamp LED', 'Furniture', '156', '$39.99', '$6,238.44', 'Warehouse B', 'In Stock'],
        ['INV-010', 'Noise Cancelling Headphones', 'Electronics', '62', '$249.99', '$15,499.38', 'Warehouse A', 'In Stock'],
        ['INV-011', 'External SSD 1TB', 'Storage', '145', '$149.99', '$21,748.55', 'Warehouse C', 'In Stock'],
        ['INV-012', 'Wireless Charger 15W', 'Accessories', '220', '$34.99', '$7,697.80', 'Warehouse A', 'In Stock'],
        ['INV-013', 'Ethernet Cable 10ft', 'Accessories', '450', '$12.99', '$5,845.50', 'Warehouse C', 'In Stock'],
        ['INV-014', 'Laptop Stand Aluminum', 'Furniture', '89', '$59.99', '$5,339.11', 'Warehouse B', 'In Stock'],
        ['INV-015', 'Bluetooth Speaker', 'Electronics', '115', '$89.99', '$10,348.85', 'Warehouse A', 'In Stock'],
    ]
    
    # Create the table
    table = Table(data, repeatRows=1)
    
    # Add style to the table
    table.setStyle(TableStyle([
        # Header row styling
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        
        # Data rows styling
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1f2937')),
        ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        
        # Alternate row colors
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f3f4f6')]),
        
        # Grid
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        
        # Align numbers to right
        ('ALIGN', (3, 1), (5, -1), 'RIGHT'),
    ]))
    
    elements.append(table)
    
    # Add footer
    elements.append(Spacer(1, 0.5*inch))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#9ca3af'),
        alignment=1
    )
    footer = Paragraph("Total Items: 15 | Total Inventory Value: $276,984.74 | Generated by Inventory Management System", footer_style)
    elements.append(footer)
    
    # Build PDF
    doc.build(elements)
    
    print(f"✅ Created sample PDF: {pdf_path}")
    print(f"   File size: {os.path.getsize(pdf_path):,} bytes")
    print(f"   Contains: 15 inventory items with 8 columns")
    print(f"   Columns: Item Code, Product Name, Category, Quantity, Unit Price, Total Value, Warehouse, Status")
    
    return True

if __name__ == "__main__":
    try:
        success = create_sample_pdf()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Failed to create PDF: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
