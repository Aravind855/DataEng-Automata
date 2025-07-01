```markdown
# Report: Transformed HR Data

**File**: transformed_hr_data.csv
**Category**: Hr
**Database**: DataEng**Schema**:

| Column Name    | Data Type |
|----------------|------------|
| employee_id    | INTEGER    |
| name           | TEXT       |
| salary         | INTEGER    |
| designation    | TEXT       |
| joining_date   | TEXT       |
| year_joined    | INTEGER    |


**Shape**: 20 rows, 6 columns

**Data Profiling**:

| Column Name    | Total Count | Unique Count | Null Count |
|----------------|-------------|--------------|------------|
| employee_id    | 20          | 20           | 0          |
| name           | 20          | 20           | 0          |
| salary         | 20          | 14           | 0          |
| designation    | 20          | 5            | 0          |
| joining_date   | 20          | 20           | 0          |
| year_joined    | 20          | 5            | 0          |

**Primary Key**: employee_id

**Missing Values**: None

**Anomalies**:

* **No duplicate rows detected.**
* **No negative values detected in numeric columns.**
* **Potential outliers in salary:**  Further investigation needed to determine if unusually high or low salaries are genuine or require further analysis.


**Feature Engineering Performed**:

* **year_joined**: This column appears to be derived from the `joining_date` column.


**Feature Engineering Suggestions**:

* **Month Joined:** Extract the month from the `joining_date` column to analyze monthly hiring trends.
* **Experience:** Calculate the number of years of experience for each employee based on their `joining_date` (requires additional data or assumptions about current date).
* **Salary Range:** Categorize salaries into ranges (e.g., low, medium, high) for easier analysis and visualization.* **Seniority Level:** Create a seniority level based on years of experience or designation.

```