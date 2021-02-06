import JoplinSettings from "api/JoplinSettings";
import { SettingItem, SettingItemType } from "api/types";

interface Settings {
    schemaVersion: number
}

async function initSettings(joplin: JoplinSettings): Promise<Settings> {
    await joplin.registerSetting('schemaVersion', {
        public: false,
        label: 'schemaVersion',
        type: SettingItemType.Int,
        value: 1,
    } as SettingItem);
    const schemaVersion = await joplin.value('schemaVersion');
    return {
        schemaVersion: schemaVersion
    };
}

export { Settings, initSettings };