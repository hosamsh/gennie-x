# Declarative Dashboard System

This document describes the declarative dashboard configuration system that allows you to define dashboards using YAML files.

## Overview

Dashboards are defined declaratively in YAML files located in `src/web/dashboards/`. Each dashboard configuration specifies:

- **Metrics**: Key statistics displayed at the top (cards with numbers/stats)
- **Charts**: Visualizations (pie, bar, line, stacked bar timeline, etc.)
- **Lists**: Data lists with progress bars, simple listings, or tables with columns

**Hot Reload**: Dashboard configurations automatically reload when YAML files are modified - no server restart needed!

## Data Sources

### Function-based Data Sources

Call a Python function to get data. Used for both system-level and workspace-specific dashboards.

```yaml
data_source:
  type: function
  function: get_code_metrics  # Name of function in provider class
  field: total_lines_added    # Optional: extract a specific field from the result
```

**Provider Selection:**
- **System Dashboards** (system_extraction.yaml): Uses `SystemDataProvider` (queries across all workspaces)
- **Workspace Dashboards** (extraction.yaml): Uses `ExtractionDataProvider` (workspace-scoped)

## Dashboard Configuration Schema

### Dashboard Metadata

```yaml
dashboard:
  id: extraction           # Unique identifier
  name: Extraction Dashboard  # Display name
  description: Code extraction metrics  # Optional description
  icon: code               # Optional icon name
  is_system_level: false   # If true, data spans all workspaces (system-wide)
```

### Metrics

```yaml
metrics:
  - id: sessions
    title: Sessions
    description: Total chat sessions
    data_source:
      type: function
      function: get_extraction_stats
      field: session_count
    format: number    # number, percent, text, datetime, datetime:split, datetime:compact
    color: blue       # Optional color (green, red, blue, cyan, purple, orange, pink, teal, etc.)
    icon: chat        # Optional icon (Material Symbols)
    text_size: md     # Optional: xs, sm, md (default), lg, xl
    subtitle_field: trend  # Optional: field name from data source to display as subtitle
```

### Charts

```yaml
charts:
  - id: model_usage
    title: Model Usage
    chart_type: pie       # pie, doughnut, bar, horizontal_bar, line
    width: half           # half or full (column span)
    order: 1              # Display order
    data_source:
      type: function
      function: get_model_usage
    value_field: locs
    label_field: model
    colors:
      gpt-4: "#3b82f6"
      claude: "#8b5cf6"
```

### Lists

```yaml
lists:
  - id: languages
    title: Languages
    data_source:
      type: function
      function: get_languages
    label_field: language
    value_field: change_count
    max_items: 10
    display_type: progress_bar  # progress_bar or list
    color: purple
```

## Chart Types

| Type | Description | Use Case |
|------|-------------|----------|
| `pie` | Pie chart | Showing distribution of categories |
| `doughnut` | Doughnut chart | Similar to pie but with center hollow |
| `bar` | Vertical bar chart | Comparing values across categories |
| `horizontal_bar` | Horizontal bar chart | Better for long category names |
| `line` | Line chart | Timeline data with single or multiple series |
| `stacked_bar_timeline` | Stacked bar chart for timeline | Multiple metrics over time |
| `area` | Area chart | Timeline data with filled area |
| `heatmap` | Heatmap grid | Two-dimensional data visualization |
| `word_cloud` | Word cloud visualization | Showing word frequency |
| `table` | Table with columns | Shows tabular data with sortable columns |

## API Endpoints

### List Dashboards
```
GET /api/dashboards
```

### Get Dashboard Configuration
```
GET /api/dashboards/{dashboard_id}
```

### Get Dashboard Data for Workspace
```
GET /api/browse/workspace/{workspace_id}/dashboards/{dashboard_id}
```

### Reload Dashboard Configurations
```
POST /api/dashboards/reload
```

## Adding a New Dashboard

1. Create a new YAML file in `src/web/dashboards/`
2. Define the dashboard configuration following the schema above
3. Add any new data provider functions if needed
4. The dashboard will automatically be available via the API (hot reload enabled)

## Adding a New Chart

1. Add chart configuration to your dashboard YAML file
2. Create a data provider function in the appropriate provider:
   - System dashboards: `src/web/data_providers/system_provider.py`
   - Workspace dashboards: `src/web/data_providers/extraction_provider.py`

```python
def get_my_chart_data(self) -> List[Dict[str, Any]]:
    """Fetch data for my new chart."""
    cursor = self.conn.execute(
        """
        SELECT category, COUNT(*) as count
        FROM my_table
        WHERE workspace_id = ?
        GROUP BY category
        ORDER BY count DESC
        """,
        (self.workspace_id,)
    )
    return [dict(row) for row in cursor.fetchall()]
```

## File Structure

```
src/web/
├── dashboards/
│   ├── system_extraction.yaml    # System overview dashboard
│   ├── extraction.yaml           # Workspace extraction metrics dashboard
│   └── README.md                 # This file
├── data_providers/
│   ├── system_provider.py        # System-wide data (all workspaces)
│   └── extraction_provider.py    # Workspace extraction data
├── services/
│   └── dashboard_service.py      # Dashboard business logic
├── routers/
│   └── dashboards.py             # Dashboard API routes
└── static/
    └── dashboard-renderer.js     # Frontend chart rendering
```
