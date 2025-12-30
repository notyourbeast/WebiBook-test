# WebiBook Data Analysis with Python

This Python script provides advanced data visualization and analysis for your WebiBook tracking data.

## Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

   Or install manually:
   ```bash
   pip install matplotlib seaborn
   ```

## Usage

1. **Export data from the admin dashboard:**
   - Open your admin dashboard (`?admin=yourpassword`)
   - Click "📥 Export All Data (JSON)"
   - Save the JSON file

2. **Run the analysis script:**
   ```bash
   python analyze_data.py webiBook-data-2024-01-15.json
   ```

   Replace `webiBook-data-2024-01-15.json` with your actual exported file name.

## What You Get

The script generates a comprehensive dashboard with:

1. **Engagement Overview** - Bar chart showing email signups, active users, and saved events
2. **User Distribution** - Pie chart showing how many events users save
3. **Most Saved Events** - Horizontal bar chart of popular events
4. **Email Domains** - Top email domains of signups
5. **User Activity** - Histogram of user engagement levels
6. **Summary Statistics** - Key metrics at a glance

The visualization is saved as a high-resolution PNG file (300 DPI) with timestamp.

## Example Output

```
📂 Loading data from: webiBook-data-2024-01-15.json
🔍 Analyzing data...

============================================================
📊 WEBIBOOK DATA ANALYSIS SUMMARY
============================================================

📧 Email Signups: 25
👥 Active Users: 12
💾 Total Saved Events: 38
📈 Average Events per User: 3.17

🔄 Visit Statistics:
   • Total Visits: 45
   • First Visit: 2024-01-10T10:30:00
   • Last Visit: 2024-01-15T14:20:00

⭐ Most Popular Events:
   • event-1: 8 saves
   • event-2: 6 saves
   • event-3: 5 saves

📮 Top Email Domains:
   • gmail.com: 15 signups
   • yahoo.com: 5 signups
   • outlook.com: 3 signups

============================================================

📊 Creating visualizations...
✅ Visualization saved to: ./webiBook_analysis_20240115_143022.png

✅ Analysis complete!
```

## Notes

- The script works with the JSON format exported from the admin dashboard
- All visualizations are saved in the same directory as the script
- The script handles missing data gracefully
- Charts are optimized for printing and presentations (300 DPI)

