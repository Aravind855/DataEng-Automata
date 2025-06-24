```markdown
# Report

**File**: transformed_iot_data.csv

**Schema**:
- sensor_id: TEXT
- timestamp: TEXT
- value: REAL
- location: TEXT
- device_type: TEXT
- year: INTEGER
- hour: INTEGER

**Shape**:
- Rows: 20
- Columns: 7

**Missing Values**:
No missing values found.

**Anomalies**:
No anomalies detected.

**Feature Engineering**:
- Extract the day of the week from the timestamp.
- Create a combined location and device_type feature.
- Investigate value distribution for each device_type.
```