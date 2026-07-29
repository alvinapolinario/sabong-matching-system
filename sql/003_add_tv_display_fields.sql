USE matching_db;

SET @db_name = DATABASE();

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE matches ADD COLUMN active_tv TINYINT(1) NOT NULL DEFAULT 0 AFTER wala_score',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'matches'
    AND COLUMN_NAME = 'active_tv'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE matches ADD COLUMN tv_meron_chicken_id INT NULL AFTER active_tv',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'matches'
    AND COLUMN_NAME = 'tv_meron_chicken_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE matches
SET tv_meron_chicken_id = meron_chicken_id
WHERE tv_meron_chicken_id IS NULL;
