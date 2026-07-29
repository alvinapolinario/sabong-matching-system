USE matching_db;

SET @db_name = DATABASE();

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE matches ADD COLUMN meron_weight INT NOT NULL DEFAULT 0 AFTER wala_chicken_id',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'matches'
    AND COLUMN_NAME = 'meron_weight'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE matches ADD COLUMN wala_weight INT NOT NULL DEFAULT 0 AFTER meron_weight',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'matches'
    AND COLUMN_NAME = 'wala_weight'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE matches ADD COLUMN weight_difference INT NOT NULL DEFAULT 0 AFTER wala_weight',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'matches'
    AND COLUMN_NAME = 'weight_difference'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE matches m
JOIN entry_data meron ON meron.chicken_id = m.meron_chicken_id
JOIN entry_data wala ON wala.chicken_id = m.wala_chicken_id
SET
  m.meron_weight = CASE WHEN m.meron_weight = 0 THEN meron.weight ELSE m.meron_weight END,
  m.wala_weight = CASE WHEN m.wala_weight = 0 THEN wala.weight ELSE m.wala_weight END,
  m.weight_difference = CASE
    WHEN m.weight_difference = 0 THEN ABS(meron.weight - wala.weight)
    ELSE m.weight_difference
  END;
