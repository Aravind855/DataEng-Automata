```markdown
# Report

**File**: transformed_hr_data.csv

**Schema**:
- employee_id: integer
- name: string
- salary: integer
- designation: string
- joining_date: string
- years_of_experience: integer

**Shape**:
- Rows: 20
- Columns: 6

**Missing Values**:
No missing values found.

**Anomalies**:
- The `years_of_experience` column contains zero values.

**Feature Engineering**:
- You can derive the employee's age from the `joining_date`.
- You can categorize employees based on their `years_of_experience` (e.g., entry-level, mid-level, senior).
```