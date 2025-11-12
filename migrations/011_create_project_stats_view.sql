CREATE OR REPLACE VIEW project_stats AS
WITH task_stats AS (
  SELECT
    project_id,
    COUNT(*) FILTER (WHERE completed = FALSE) AS open_tasks,
    COUNT(*) FILTER (WHERE completed = TRUE) AS completed_tasks
  FROM tasks
  GROUP BY project_id
),
content_stats AS (
  SELECT
    project_id,
    COUNT(*) AS content_count,
    COALESCE(SUM(views), 0) AS total_views,
    MAX(published_at) AS last_published_at
  FROM content
  GROUP BY project_id
)
SELECT
  p.id AS project_id,
  COALESCE(ts.open_tasks, 0) AS open_tasks,
  COALESCE(ts.completed_tasks, 0) AS completed_tasks,
  COALESCE(cs.content_count, 0) AS content_count,
  COALESCE(cs.total_views, 0) AS total_views,
  cs.last_published_at
FROM projects p
LEFT JOIN task_stats ts ON ts.project_id = p.id
LEFT JOIN content_stats cs ON cs.project_id = p.id;
