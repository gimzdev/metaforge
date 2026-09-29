/** Words that identify an emblem's trait inside ids like DA_18_EmblemSlayer or TFT18_Item_SlayerEmblemItem. */
export function emblemToken(key: string): string {
  return key
    .toLowerCase()
    .replace(/^(tft\d*_item_|tft\d*_|da_\d*_?)/, '')
    .replace(/^emblem/, '')
    .replace(/(emblemitem|emblem|item)$/, '')
    .replace(/[^a-z0-9]/g, '');
}
