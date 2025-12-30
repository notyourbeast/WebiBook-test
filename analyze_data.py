#!/usr/bin/env python3
"""
WebiBook Data Analysis Tool
Analyzes exported JSON data and creates advanced visualizations

Usage:
    python analyze_data.py <path_to_exported_json_file>

Example:
    python analyze_data.py webiBook-data-2024-01-15.json
"""

import json
import sys
from datetime import datetime
from collections import Counter
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib import style
import seaborn as sns

# Set style for better-looking charts
style.use('seaborn-v0_8-darkgrid')
sns.set_palette("husl")

def load_data(filepath):
    """Load JSON data from exported file"""
    import os
    import glob
    
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        print(f"\n❌ Error: File '{filepath}' not found.\n")
        
        # Show available JSON files
        json_files = glob.glob('*.json')
        if json_files:
            print("📁 Available JSON files in current directory:")
            for f in json_files:
                print(f"   • {f}")
            print(f"\n💡 Try using one of these files, or:")
            print(f"   1. Export data from admin dashboard (?admin=password)")
            print(f"   2. Use the sample file: python analyze_data.py webiBook-data-sample.json")
        else:
            print("📁 No JSON files found in current directory.")
            print(f"\n💡 To get started:")
            print(f"   1. Export data from admin dashboard (?admin=password)")
            print(f"   2. Or use the sample file if it exists")
        
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in '{filepath}'")
        sys.exit(1)

def analyze_data(data):
    """Analyze the data and return statistics"""
    stats = {
        'total_emails': len(data.get('weeklyEmails', [])),
        'total_users': len(data.get('savedEvents', {})),
        'total_saved_events': sum(len(events) for events in data.get('savedEvents', {}).values()),
        'users_by_event_count': {},
        'most_saved_events': Counter(),
        'email_domains': Counter()
    }
    
    # Analyze saved events by user
    for email, events in data.get('savedEvents', {}).items():
        event_count = len(events)
        stats['users_by_event_count'][event_count] = stats['users_by_event_count'].get(event_count, 0) + 1
        
        # Count which events are saved most
        for event_id in events:
            stats['most_saved_events'][event_id] += 1
    
    # Analyze email domains
    for email in data.get('weeklyEmails', []):
        if '@' in email:
            domain = email.split('@')[1]
            stats['email_domains'][domain] += 1
    
    # Visit statistics
    visit_stats = data.get('visitStats', {})
    stats['first_visit'] = visit_stats.get('firstVisit')
    stats['visit_count'] = int(visit_stats.get('visitCount', 0) or 0)
    stats['last_visit'] = visit_stats.get('lastVisit')
    
    return stats

def create_visualizations(data, stats, output_dir='.'):
    """Create comprehensive visualizations"""
    
    # Create figure with subplots
    fig = plt.figure(figsize=(16, 10))
    
    # 1. Engagement Overview (Bar Chart)
    ax1 = plt.subplot(2, 3, 1)
    categories = ['Email\nSignups', 'Active\nUsers', 'Saved\nEvents']
    values = [stats['total_emails'], stats['total_users'], stats['total_saved_events']]
    colors = ['#1a1a1a', '#4a4a4a', '#7a7a7a']
    bars = ax1.bar(categories, values, color=colors, edgecolor='black', linewidth=1.5)
    ax1.set_title('Engagement Overview', fontsize=14, fontweight='bold', pad=15)
    ax1.set_ylabel('Count', fontsize=12)
    ax1.grid(axis='y', alpha=0.3, linestyle='--')
    
    # Add value labels on bars
    for bar in bars:
        height = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2., height,
                f'{int(height)}',
                ha='center', va='bottom', fontweight='bold')
    
    # 2. User Engagement Distribution (Pie Chart)
    ax2 = plt.subplot(2, 3, 2)
    if stats['users_by_event_count']:
        labels = [f'{count} events' for count in sorted(stats['users_by_event_count'].keys())]
        sizes = [stats['users_by_event_count'][count] for count in sorted(stats['users_by_event_count'].keys())]
        ax2.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
        ax2.set_title('Users by Event Count', fontsize=14, fontweight='bold', pad=15)
    else:
        ax2.text(0.5, 0.5, 'No data', ha='center', va='center', transform=ax2.transAxes)
        ax2.set_title('Users by Event Count', fontsize=14, fontweight='bold', pad=15)
    
    # 3. Most Saved Events (Horizontal Bar)
    ax3 = plt.subplot(2, 3, 3)
    if stats['most_saved_events']:
        top_events = stats['most_saved_events'].most_common(10)
        events = [f"Event {eid}" for eid, _ in top_events]
        counts = [count for _, count in top_events]
        ax3.barh(events, counts, color='#1a1a1a', edgecolor='black', linewidth=1)
        ax3.set_title('Most Saved Events', fontsize=14, fontweight='bold', pad=15)
        ax3.set_xlabel('Save Count', fontsize=12)
        ax3.grid(axis='x', alpha=0.3, linestyle='--')
    else:
        ax3.text(0.5, 0.5, 'No data', ha='center', va='center', transform=ax3.transAxes)
        ax3.set_title('Most Saved Events', fontsize=14, fontweight='bold', pad=15)
    
    # 4. Email Domains (Top 10)
    ax4 = plt.subplot(2, 3, 4)
    if stats['email_domains']:
        top_domains = stats['email_domains'].most_common(10)
        domains = [domain for domain, _ in top_domains]
        counts = [count for _, count in top_domains]
        ax4.bar(domains, counts, color='#4a4a4a', edgecolor='black', linewidth=1)
        ax4.set_title('Top Email Domains', fontsize=14, fontweight='bold', pad=15)
        ax4.set_ylabel('Count', fontsize=12)
        ax4.set_xlabel('Domain', fontsize=12)
        plt.setp(ax4.xaxis.get_majorticklabels(), rotation=45, ha='right')
        ax4.grid(axis='y', alpha=0.3, linestyle='--')
    else:
        ax4.text(0.5, 0.5, 'No data', ha='center', va='center', transform=ax4.transAxes)
        ax4.set_title('Top Email Domains', fontsize=14, fontweight='bold', pad=15)
    
    # 5. User Activity Heatmap (if we have enough data)
    ax5 = plt.subplot(2, 3, 5)
    if stats['total_users'] > 0:
        # Create a simple activity visualization
        user_activity = []
        for email, events in data.get('savedEvents', {}).items():
            user_activity.append(len(events))
        
        if user_activity:
            ax5.hist(user_activity, bins=min(10, max(3, len(set(user_activity)))), 
                    color='#1a1a1a', edgecolor='black', linewidth=1.5)
            ax5.set_title('User Activity Distribution', fontsize=14, fontweight='bold', pad=15)
            ax5.set_xlabel('Events Saved per User', fontsize=12)
            ax5.set_ylabel('Number of Users', fontsize=12)
            ax5.grid(axis='y', alpha=0.3, linestyle='--')
    else:
        ax5.text(0.5, 0.5, 'No data', ha='center', va='center', transform=ax5.transAxes)
        ax5.set_title('User Activity Distribution', fontsize=14, fontweight='bold', pad=15)
    
    # 6. Summary Statistics (Text)
    ax6 = plt.subplot(2, 3, 6)
    ax6.axis('off')
    summary_text = f"""
    DATA SUMMARY
    
    Total Email Signups: {stats['total_emails']}
    Active Users: {stats['total_users']}
    Total Saved Events: {stats['total_saved_events']}
    
    Average Events per User: {stats['total_saved_events'] / stats['total_users'] if stats['total_users'] > 0 else 0:.1f}
    
    Visit Statistics:
    - Total Visits: {stats['visit_count']}
    - First Visit: {stats['first_visit'] or 'N/A'}
    - Last Visit: {stats['last_visit'] or 'N/A'}
    
    Top Event ID: {stats['most_saved_events'].most_common(1)[0][0] if stats['most_saved_events'] else 'N/A'}
    """
    ax6.text(0.1, 0.5, summary_text, fontsize=11, verticalalignment='center',
            family='monospace', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.3))
    
    plt.suptitle('WebiBook Analytics Dashboard', fontsize=18, fontweight='bold', y=0.995)
    plt.tight_layout(rect=[0, 0, 1, 0.98])
    
    # Save the figure
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'{output_dir}/webiBook_analysis_{timestamp}.png'
    plt.savefig(filename, dpi=300, bbox_inches='tight')
    print(f"✅ Visualization saved to: {filename}")
    
    return filename

def print_summary(stats):
    """Print summary statistics to console"""
    print("\n" + "="*60)
    print("📊 WEBIBOOK DATA ANALYSIS SUMMARY")
    print("="*60)
    print(f"\n📧 Email Signups: {stats['total_emails']}")
    print(f"👥 Active Users: {stats['total_users']}")
    print(f"💾 Total Saved Events: {stats['total_saved_events']}")
    
    if stats['total_users'] > 0:
        print(f"📈 Average Events per User: {stats['total_saved_events'] / stats['total_users']:.2f}")
    
    print(f"\n🔄 Visit Statistics:")
    print(f"   • Total Visits: {stats['visit_count']}")
    print(f"   • First Visit: {stats['first_visit'] or 'N/A'}")
    print(f"   • Last Visit: {stats['last_visit'] or 'N/A'}")
    
    if stats['most_saved_events']:
        print(f"\n⭐ Most Popular Events:")
        for event_id, count in stats['most_saved_events'].most_common(5):
            print(f"   • {event_id}: {count} saves")
    
    if stats['email_domains']:
        print(f"\n📮 Top Email Domains:")
        for domain, count in stats['email_domains'].most_common(5):
            print(f"   • {domain}: {count} signups")
    
    print("\n" + "="*60 + "\n")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n❌ Error: Please provide the path to the exported JSON file.")
        print("\nExample:")
        print("  python analyze_data.py webiBook-data-2024-01-15.json")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    print(f"📂 Loading data from: {filepath}")
    data = load_data(filepath)
    
    print("🔍 Analyzing data...")
    stats = analyze_data(data)
    
    print_summary(stats)
    
    print("📊 Creating visualizations...")
    try:
        output_file = create_visualizations(data, stats)
        print(f"\n✅ Analysis complete! Check the visualization: {output_file}")
    except Exception as e:
        print(f"\n❌ Error creating visualizations: {e}")
        print("Make sure you have matplotlib and seaborn installed:")
        print("  pip install matplotlib seaborn")

if __name__ == '__main__':
    main()

