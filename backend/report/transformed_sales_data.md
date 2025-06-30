```markdown
# Report

**File**: transformed_sales_data.csv
**Schema**:- customer_name: TEXT
- revenue: INTEGER
- invoice_id: TEXT- product: TEXT
- date: TEXT
- day_of_week: TEXT
**Shape**:
- Rows: 20
- Columns: 6
**Missing Values**:
No missing values found.
**Anomalies**:
No anomalies found.
**Feature Engineering**:
- You can extract the month from the 'date' column.
- You can convert the 'date' column to a datetime object and calculate the time difference between the dates.
```