ALTER TABLE `game_account_states`
  ADD COLUMN IF NOT EXISTS `equipmentData` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `equipmentLoadoutsData` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `selectedEquipmentGeneralId` varchar(64) NULL;
