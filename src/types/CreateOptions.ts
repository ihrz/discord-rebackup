export interface CreateOptions {
    backupID?: string;
    maxMessagesPerChannel?: number;
    jsonSave?: boolean;
    jsonBeautify?: boolean;
    doNotBackup?: string[];
    backupMembers?: boolean;
    saveImages?: string;
    selfBot?: boolean;
    devMode?: boolean; // Activer/désactiver les logs de débogage
}
