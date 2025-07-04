import type {
    CategoryData,
    ChannelPermissionsData,
    CreateOptions,
    LoadOptions,
    MessageData,
    TextChannelData,
    ThreadChannelData,
    VoiceChannelData
} from './types';
import { debug, debugLoad, error, info, warn } from './logger';

// Support pour discord.js v14 et discord.js-selfbot-v13
let ChannelType: any;
let OverwriteType: any;
let GuildPremiumTier: any;

// Importer les deux bibliothèques
let discordjs: any;
let discordjsSelfbot: any;

// Indicateur pour savoir si nous utilisons le mode selfbot
let isSelfbotMode = false;

try {
    // discord.js v14
    discordjs = require('discord.js');
    ChannelType = discordjs.ChannelType;
    OverwriteType = discordjs.OverwriteType;
    GuildPremiumTier = discordjs.GuildPremiumTier;

    // Essayer d'importer discord.js-selfbot-v13 aussi
    try {
        discordjsSelfbot = require('discord.js-selfbot-v13');
    } catch (e) { }
} catch (e) {
    // Si discord.js n'est pas disponible, utiliser discord.js-selfbot-v13 par défaut
    try {
        discordjsSelfbot = require('discord.js-selfbot-v13');
        isSelfbotMode = true;

        // Définir les constantes pour la compatibilité
        ChannelType = {
            GuildText: 'GUILD_TEXT',
            GuildVoice: 'GUILD_VOICE',
            GuildCategory: 'GUILD_CATEGORY',
            GuildAnnouncement: 'GUILD_NEWS',
            GuildStageVoice: 'GUILD_STAGE_VOICE',
            GuildForum: 'GUILD_FORUM',
            GuildMedia: 'GUILD_MEDIA',
        };
        OverwriteType = {
            Role: 'role',
            Member: 'member'
        };
        GuildPremiumTier = {
            None: 'NONE',
            Tier1: 'TIER_1',
            Tier2: 'TIER_2',
            Tier3: 'TIER_3'
        };
    } catch (e) {
        throw new Error('Aucune bibliothèque Discord.js n\'est disponible');
    }
}

// Fonction pour activer le mode selfbot
export function enableSelfbotMode() {
    if (discordjsSelfbot) {
        isSelfbotMode = true;
        return true;
    } else {
        return false;
    }
}

// Fonction pour désactiver le mode selfbot
export function disableSelfbotMode() {
    if (discordjs) {
        isSelfbotMode = false;
        return true;
    } else {
        return false;
    }
}

// Import des types nécessaires en fonction de la version disponible
if (isSelfbotMode) {
    discordjs = discordjsSelfbot;
} else {
    try {
        // Tenter d'importer discord.js v14
        discordjs = require('discord.js');
    } catch {
        // Si échec, on suppose que c'est discord.js-selfbot-v13
        discordjs = require('discord.js-selfbot-v13');
    }
}

const {
    CategoryChannel,
    Collection,
    Guild,
    GuildFeature,
    GuildDefaultMessageNotifications,
    GuildSystemChannelFlags,
    Message,
    OverwriteData,
    Snowflake,
    TextChannel,
    VoiceChannel,
    NewsChannel,
    ThreadChannel,
    Webhook,
    GuildExplicitContentFilter,
    GuildVerificationLevel,
    FetchMessagesOptions,
    StageChannel
} = discordjs;

// Types pour TypeScript
type GuildType = typeof Guild;
type CategoryChannelType = typeof CategoryChannel;
type TextChannelType = typeof TextChannel;
type VoiceChannelType = typeof VoiceChannel;
type StageChannelType = typeof StageChannel;
type NewsChannelType = typeof NewsChannel;
type ThreadChannelType = typeof ThreadChannel;
type CollectionType = typeof Collection;
type MessageType = typeof Message;
type SnowflakeType = typeof Snowflake;
type FetchMessagesOptionsType = any; // Compatible avec les deux versions
type OverwriteDataType = any; // Compatible avec les deux versions
type WebhookType = typeof Webhook;
type ChannelTypeEnum = typeof ChannelType;
type AttachmentBuilderType = any; // Compatible avec les deux versions
type GuildChannelCreateOptionsType = any; // Compatible avec les deux versions

const MaxBitratePerTier: Record<number, number> = {
    [GuildPremiumTier.None]: 64000,
    [GuildPremiumTier.Tier1]: 128000,
    [GuildPremiumTier.Tier2]: 256000,
    [GuildPremiumTier.Tier3]: 384000
};

/**
 * Gets the permissions for a channel
 */
export function fetchChannelPermissions(channel: InstanceType<TextChannelType> | InstanceType<VoiceChannelType> | InstanceType<CategoryChannelType> | InstanceType<NewsChannelType> | InstanceType<StageChannelType>) {
    const permissions: ChannelPermissionsData[] = [];
    try {
        const typedChannel = channel as any;

        // Vérifier si permissionOverwrites existe et a une propriété cache
        if (!typedChannel.permissionOverwrites || !typedChannel.permissionOverwrites.cache) {
            console.error(`Le canal ${typedChannel.name || typedChannel.id || 'inconnu'} n'a pas de permissionOverwrites valides`);
            return permissions;
        }

        typedChannel.permissionOverwrites.cache
            .filter((p: any) => p.type === OverwriteType.Role || p.type === 'role')
            .forEach((perm: any) => {
                try {
                    // For each overwrites permission
                    if (!typedChannel.guild || !typedChannel.guild.roles || !typedChannel.guild.roles.cache) {
                        return; // Skip if guild or roles cache is not available
                    }

                    const role = typedChannel.guild.roles.cache.get(perm.id);
                    if (role) {
                        // Vérifier si perm.allow et perm.deny existent et ont une propriété bitfield
                        const allowBitfield = perm.allow && perm.allow.bitfield ? perm.allow.bitfield.toString() : '0';
                        const denyBitfield = perm.deny && perm.deny.bitfield ? perm.deny.bitfield.toString() : '0';

                        permissions.push({
                            roleName: role.name,
                            allow: allowBitfield,
                            deny: denyBitfield
                        });
                    }
                } catch (permError) {
                    console.error(`Erreur lors de la récupération des permissions pour le rôle ${perm?.id || 'inconnu'}: ${permError}`);
                }
            });
    } catch (error) {
        console.error(`Erreur lors de la récupération des permissions du canal: ${error}`);
    }
    return permissions;
}

/**
 * Fetches the voice channel data that is necessary for the backup
 */
export async function fetchVoiceChannelData(channel: InstanceType<VoiceChannelType>) {
    return new Promise<VoiceChannelData>(async (resolve) => {
        const typedChannel = channel as any;
        const channelData: VoiceChannelData = {
            type: ChannelType.GuildVoice,
            name: typedChannel.name,
            bitrate: typedChannel.bitrate,
            userLimit: typedChannel.userLimit,
            parent: typedChannel.parent ? typedChannel.parent.name : null,
            permissions: fetchChannelPermissions(typedChannel)
        };
        /* Return channel data */
        resolve(channelData);
    });
}

export async function fetchStageChannelData(channel: InstanceType<StageChannelType>) {
    return new Promise<VoiceChannelData>(async (resolve) => {
        const typedChannel = channel as any;
        const channelData: VoiceChannelData = {
            type: typedChannel.type,
            name: typedChannel.name,
            bitrate: typedChannel.bitrate,
            userLimit: typedChannel.userLimit,
            parent: typedChannel.parent ? typedChannel.parent.name : null,
            permissions: fetchChannelPermissions(typedChannel)
        };
        /* Return channel data */
        resolve(channelData);
    });
}

export async function fetchChannelMessages(channel: InstanceType<TextChannelType> | InstanceType<NewsChannelType> | InstanceType<ThreadChannelType>, options: CreateOptions): Promise<MessageData[]> {
    let messages: MessageData[] = [];
    const typedChannel = channel as any;
    const messageCount: number = isNaN(options.maxMessagesPerChannel) ? 10 : options.maxMessagesPerChannel;
    const fetchOptions: FetchMessagesOptionsType = { limit: 100 };
    let lastMessageId: InstanceType<SnowflakeType>;
    let fetchComplete: boolean = false;
    while (!fetchComplete) {
        if (lastMessageId) {
            fetchOptions.before = lastMessageId;
        }
        const fetched: InstanceType<CollectionType> = await typedChannel.messages.fetch(fetchOptions);
        if (fetched.size === 0) {
            break;
        }
        lastMessageId = fetched.last().id;
        await Promise.all(fetched.map(async (msg: any) => {
            if (!msg.author || messages.length >= messageCount) {
                fetchComplete = true;
                return;
            }
            const files = await Promise.all(msg.attachments.map(async (a: any) => {
                let attach = a.url
                if (a.url && ['png', 'jpg', 'jpeg', 'jpe', 'jif', 'jfif', 'jfi'].includes(a.url)) {
                    if (options.saveImages) {
                        attach = Buffer.from((await (fetch(a.url).then((res) => (res).arrayBuffer())))).toString("base64")
                    }
                }
                return {
                    name: a.name,
                    attachment: attach
                };
            }))
            messages.push({
                username: msg.author.username,
                avatar: msg.author.displayAvatarURL(),
                content: msg.cleanContent,
                embeds: msg.embeds,
                files,
                pinned: msg.pinned,
                sentAt: msg.createdAt.toISOString(),
            });
        }));
    }

    return messages;
}

/**
 * Fetches the text channel data that is necessary for the backup
 */
export async function fetchTextChannelData(channel: InstanceType<TextChannelType> | InstanceType<NewsChannelType>, options: CreateOptions) {
    return new Promise<TextChannelData>(async (resolve) => {
        const typedChannel = channel as any;
        const channelData: TextChannelData = {
            type: typedChannel.type,
            name: typedChannel.name,
            nsfw: typedChannel.nsfw,
            rateLimitPerUser: typedChannel.type === ChannelType.GuildText || typedChannel.type === 'GUILD_TEXT' ? typedChannel.rateLimitPerUser : undefined,
            parent: typedChannel.parent ? typedChannel.parent.name : null,
            topic: typedChannel.topic,
            permissions: fetchChannelPermissions(typedChannel),
            messages: [],
            isNews: typedChannel.type === ChannelType.GuildAnnouncement || typedChannel.type === 'GUILD_NEWS',
            threads: []
        };
        /* Fetch channel threads */
        if (typedChannel.threads && typedChannel.threads.cache && typedChannel.threads.cache.size > 0) {
            await Promise.all(typedChannel.threads.cache.map(async (thread: any) => {
                const typedThread = thread as any;
                const threadData: ThreadChannelData = {
                    type: typedThread.type,
                    name: typedThread.name,
                    archived: typedThread.archived,
                    autoArchiveDuration: typedThread.autoArchiveDuration,
                    locked: typedThread.locked,
                    rateLimitPerUser: typedThread.rateLimitPerUser,
                    messages: []
                };
                try {
                    threadData.messages = await fetchChannelMessages(typedThread, options);
                    /* Return thread data */
                    channelData.threads.push(threadData);
                } catch (error) {
                    channelData.threads.push(threadData);
                }
            }));
        }
        /* Fetch channel messages */
        try {
            channelData.messages = await fetchChannelMessages(typedChannel, options);

            /* Return channel data */
            resolve(channelData);
        } catch (error) {
            resolve(channelData);
        }
    });
}

/**
 * Creates a category for the guild
 */
export async function loadCategory(categoryData: CategoryData, guild: InstanceType<GuildType>) {
    return new Promise<InstanceType<CategoryChannelType>>((resolve) => {
        // Vérifier si nous sommes en mode selfbot
        let categoryPromise: Promise<any>;

        if (isSelfbotMode && discordjsSelfbot) {
            // Utiliser discord.js-selfbot-v13 directement
            categoryPromise = (guild.channels as any).create(categoryData.name, {
                type: 'GUILD_CATEGORY'
            });
        } else {
            // discord.js v14
            categoryPromise = (guild.channels as any).create({
                name: categoryData.name,
                type: ChannelType.GuildCategory
            });
        }

        categoryPromise.then(async (category: any) => {
            // When the category is created
            const finalPermissions: OverwriteDataType[] = categoryData.permissions.map((perm: any) => {
                const role = guild.roles.cache.find((r: any) => r.name === perm.roleName);
                if (role) {
                    return {
                        id: role.id,
                        allow: BigInt(perm.allow),
                        deny: BigInt(perm.deny),
                        type: OverwriteType.Role
                    } as OverwriteDataType;
                } else return null;
            }).filter((perm: any) => perm !== null);
            await category.permissionOverwrites.set(finalPermissions);
            resolve(category); // Return the category
        });
    });
}

/**
 * Create a channel and returns it
 */
export async function loadChannel(channelData: TextChannelData | VoiceChannelData, guild: InstanceType<GuildType>, category?: InstanceType<CategoryChannelType>, options?: LoadOptions) {
    return new Promise<void>(async (resolve) => {

        const loadMessages = (channel: InstanceType<TextChannelType> | InstanceType<ThreadChannelType>, messages: MessageData[], previousWebhook?: InstanceType<WebhookType>): Promise<InstanceType<WebhookType> | void> => {
            return new Promise<InstanceType<WebhookType> | void>(async (resolve) => {
                // Vérifier si le canal est un thread ou un canal de texte
                let webhook: InstanceType<WebhookType> | null = previousWebhook || null;
                debug(`Canal: ${channel.name}, Est un thread: ${(channel as any).isThread}, Peut récupérer webhooks: ${!!(channel as any).fetchWebhooks}`);
                debug(`Mode selfbot: ${isSelfbotMode}, Discord.js-selfbot-v13 disponible: ${!!discordjsSelfbot}`);

                // Vérifier si le canal est un thread en appelant la fonction isThread si elle existe
                const isThreadChannel = typeof (channel as any).isThread === 'function' ? (channel as any).isThread() : (channel as any).isThread;
                debug(`Vérification si ${channel.name} est un thread: ${isThreadChannel}`);

                if (!webhook && !isThreadChannel && (channel as any).fetchWebhooks) {
                    try {
                        debug(`Tentative de récupération des webhooks pour le canal ${channel.name}`);
                        const webhooks = await (channel as InstanceType<TextChannelType>).fetchWebhooks();
                        debug(`Webhooks récupérés: ${webhooks.size}`);
                        webhook = webhooks.find((w: any) => w.name === 'MessagesBackup') || null;
                        debug(`Webhook MessagesBackup trouvé: ${!!webhook}`);
                    } catch (err) {
                        error('Erreur lors de la récupération des webhooks:', err);
                    }
                }

                if (!webhook && !isThreadChannel && (channel as any).createWebhook) {
                    try {
                        debug(`Tentative de création d'un webhook pour le canal ${channel.name}`);
                        if (isSelfbotMode && discordjsSelfbot) {
                            // discord.js-selfbot-v13
                            debug(`Création d'un webhook en mode selfbot`);
                            webhook = await (channel as any).createWebhook('MessagesBackup', {
                                avatar: channel.client.user.displayAvatarURL()
                            }).catch((err: any): null => {
                                error('Erreur lors de la création du webhook en mode selfbot:', err);
                                return null;
                            });
                        } else {
                            // discord.js v14
                            debug(`Création d'un webhook en mode normal`);
                            webhook = await (channel as any).createWebhook({
                                name: 'MessagesBackup',
                                avatar: channel.client.user.displayAvatarURL()
                            }).catch((err: any): null => {
                                error('Erreur lors de la création du webhook en mode normal:', err);
                                return null;
                            });
                        }
                        debug(`Webhook créé avec succès: ${!!webhook}`);
                    } catch (err) {
                        error('Erreur lors de la création du webhook:', err);
                    }
                }
                if (!webhook) {
                    debug(`Aucun webhook disponible pour le canal ${channel.name}, impossible d'envoyer les messages`);
                    return resolve(undefined);
                }
                debug(`Webhook disponible pour le canal ${channel.name}, prêt à envoyer ${messages.length} messages`);
                // Filtrer les messages vides
                messages = messages
                    .filter((m) => m.content.length > 0 || m.embeds.length > 0 || m.files.length > 0)
                    .reverse();

                // Si maxMessagesPerChannel est défini et n'est pas -1 (valeur spéciale pour "tous les messages")
                if (options.maxMessagesPerChannel && options.maxMessagesPerChannel !== -1) {
                    debug(`Limitation à ${options.maxMessagesPerChannel} messages pour le canal ${channel.name}`);
                    messages = messages.slice(messages.length - options.maxMessagesPerChannel);
                } else if (options.maxMessagesPerChannel === -1) {
                    debug(`Restauration de tous les ${messages.length} messages pour le canal ${channel.name}`);
                }
                for (const msg of messages) {
                    try {
                        // Préparer les options de base pour l'envoi du message
                        const messageOptions: any = {
                            content: msg.content.length ? msg.content : undefined,
                            username: msg.username,
                            avatarURL: msg.avatar,
                            embeds: msg.embeds,
                            allowedMentions: options.allowedMentions
                        };

                        // Ajouter les pièces jointes si présentes
                        if (msg.files && msg.files.length > 0) {
                            try {
                                // Gestion des pièces jointes compatible avec les deux versions
                                const buffer = await fetch(msg.files[0].attachment)
                                    .then((res) => (res).arrayBuffer())
                                    .catch((error): null => {
                                        return null;
                                    });

                                if (buffer) {
                                    // Créer l'attachment en fonction de la version disponible
                                    if (isSelfbotMode && discordjsSelfbot) {
                                        // discord.js-selfbot-v13
                                        messageOptions.files = [{ attachment: buffer, name: msg.files[0].name }];
                                    } else {
                                        // discord.js v14
                                        const { AttachmentBuilder } = require('discord.js');
                                        messageOptions.files = [new AttachmentBuilder(buffer, { name: msg.files[0].name })];
                                    }
                                }
                            } catch (error) {
                            }
                        }

                        // Envoyer le message via le webhook
                        debug(`Tentative d'envoi d'un message via webhook dans le canal ${channel.name}`);
                        debug(`Options du message:`, JSON.stringify(messageOptions, null, 2));
                        const sentMsg = await webhook.send(messageOptions)
                            .then((msg: any) => {
                                debug(`Message envoyé avec succès via webhook dans le canal ${channel.name}`);
                                return msg;
                            })
                            .catch((err: any) => {
                                error(`Erreur lors de l'envoi du message via webhook:`, err);
                                resolve(undefined);
                            });
                        if (msg.pinned && sentMsg) await (sentMsg as InstanceType<MessageType>).pin();
                    } catch (error) {
                    }
                }
                resolve(webhook);
            });
        }
        // Create the channel
        let channel: InstanceType<TextChannelType> | InstanceType<ThreadChannelType> | InstanceType<VoiceChannelType> | null = null;

        // Préparer les options de création de canal en fonction du mode
        let channelPromise: Promise<any>;

        if (isSelfbotMode && discordjsSelfbot) {
            // Mode selfbot avec discord.js-selfbot-v13

            // Déterminer le type de canal pour discord.js-selfbot-v13
            let channelType = 'GUILD_TEXT';
            const channelTypeStr = String(channelData.type);

            if (channelTypeStr === String(ChannelType.GuildVoice) || channelTypeStr === 'GUILD_VOICE') {
                channelType = 'GUILD_VOICE';
            } else if (channelTypeStr === String(ChannelType.GuildAnnouncement) || channelTypeStr === 'GUILD_NEWS') {
                channelType = 'GUILD_NEWS';
            } else if (channelTypeStr === String(ChannelType.GuildStageVoice) || channelTypeStr === 'GUILD_STAGE_VOICE') {
                channelType = 'GUILD_STAGE_VOICE';
            }

            // Créer les options pour discord.js-selfbot-v13
            const createOptions: any = {
                type: channelType
            };

            // Ajouter le parent si disponible
            if (category) {
                createOptions.parent = category.id;
            }

            // Ajouter les options spécifiques au type de canal
            if (channelType === 'GUILD_TEXT' || channelType === 'GUILD_NEWS') {
                if ((channelData as TextChannelData).topic) {
                    createOptions.topic = (channelData as TextChannelData).topic;
                }
                if (typeof (channelData as TextChannelData).nsfw === 'boolean') {
                    createOptions.nsfw = (channelData as TextChannelData).nsfw;
                }
                if ((channelData as TextChannelData).rateLimitPerUser) {
                    createOptions.rate_limit_per_user = (channelData as TextChannelData).rateLimitPerUser;
                }
            } else if (channelType === 'GUILD_VOICE') {
                // Downgrade bitrate si nécessaire
                if ((channelData as VoiceChannelData).bitrate) {
                    let bitrate = (channelData as VoiceChannelData).bitrate;
                    const bitrates = Object.values(MaxBitratePerTier);
                    while (bitrate > MaxBitratePerTier[guild.premiumTier]) {
                        bitrate = bitrates[guild.premiumTier];
                    }
                    createOptions.bitrate = bitrate;
                }
                if ((channelData as VoiceChannelData).userLimit) {
                    createOptions.userLimit = (channelData as VoiceChannelData).userLimit;
                }
            }

            channelPromise = (guild.channels as any).create(channelData.name, createOptions);
        } else {
            // Mode normal avec discord.js v14

            const createOptions: any = {
                name: channelData.name,
                parent: category
            };

            // Définir le type de canal pour discord.js v14
            const channelTypeStr = String(channelData.type);
            if (channelTypeStr === String(ChannelType.GuildText) || channelTypeStr === 'GUILD_TEXT') {
                createOptions.type = ChannelType.GuildText;
            } else if (channelTypeStr === String(ChannelType.GuildVoice) || channelTypeStr === 'GUILD_VOICE') {
                createOptions.type = ChannelType.GuildVoice;
            } else if (channelTypeStr === String(ChannelType.GuildAnnouncement) || channelTypeStr === 'GUILD_NEWS') {
                createOptions.type = ChannelType.GuildAnnouncement;
            } else if (channelTypeStr === String(ChannelType.GuildStageVoice) || channelTypeStr === 'GUILD_STAGE_VOICE') {
                createOptions.type = ChannelType.GuildStageVoice;
            }

            // Ajouter les options spécifiques au type de canal
            if (channelTypeStr === String(ChannelType.GuildText) || channelTypeStr === 'GUILD_TEXT' ||
                channelTypeStr === String(ChannelType.GuildAnnouncement) || channelTypeStr === 'GUILD_NEWS' ||
                channelTypeStr === String(ChannelType.GuildForum) || channelTypeStr === 'GUILD_FORUM' ||
                channelTypeStr === String(ChannelType.GuildMedia) || channelTypeStr === 'GUILD_MEDIA' ||
                channelTypeStr === String(ChannelType.GuildStageVoice) || channelTypeStr === 'GUILD_STAGE_VOICE'
            ) {
                createOptions.topic = (channelData as TextChannelData).topic;
                createOptions.nsfw = (channelData as TextChannelData).nsfw;
                createOptions.rateLimitPerUser = (channelData as TextChannelData).rateLimitPerUser;
            } else if (channelTypeStr === String(ChannelType.GuildVoice) || channelTypeStr === 'GUILD_VOICE') {
                // Downgrade bitrate
                let bitrate = (channelData as VoiceChannelData).bitrate;
                const bitrates = Object.values(MaxBitratePerTier);
                while (bitrate > MaxBitratePerTier[guild.premiumTier]) {
                    bitrate = bitrates[guild.premiumTier];
                }
                createOptions.bitrate = bitrate;
                createOptions.userLimit = (channelData as VoiceChannelData).userLimit;
            }

            channelPromise = (guild.channels as any).create(createOptions);
        }

        channelPromise.then(async (channel: any) => {
            /* Update channel permissions */
            const finalPermissions: OverwriteDataType[] = channelData.permissions.map((perm: any) => {
                const role = guild.roles.cache.find((r: any) => r.name === perm.roleName);
                if (role) {
                    return {
                        id: role.id,
                        allow: BigInt(perm.allow),
                        deny: BigInt(perm.deny),
                        type: OverwriteType.Role
                    } as OverwriteDataType;
                } else return null;
            }).filter((perm: any) => perm !== null);
            await channel.permissionOverwrites.set(finalPermissions);
            if (channelData.type === ChannelType.GuildText || String(channelData.type) === 'GUILD_TEXT') {
                /* Load messages */
                let webhook: InstanceType<WebhookType> | void;
                debug(`Canal de type texte détecté: ${channel.name}, Type: ${channelData.type}`);

                // Vérifier si le canal a des messages
                if ((channelData as TextChannelData).messages && (channelData as TextChannelData).messages.length > 0) {
                    debug(`Le canal ${channel.name} a ${(channelData as TextChannelData).messages.length} messages à charger`);
                    debug(`Premier message: ${JSON.stringify((channelData as TextChannelData).messages[0], null, 2)}`);

                    try {
                        webhook = await loadMessages(channel as InstanceType<TextChannelType>, (channelData as TextChannelData).messages);
                        debug(`Messages chargés avec succès dans le canal ${channel.name}, Webhook créé: ${!!webhook}`);
                    } catch (err) {
                        error(`Erreur lors du chargement des messages dans le canal ${channel.name}:`, err);
                    }
                } else {
                    debug(`Le canal ${channel.name} n'a pas de messages à charger ou la propriété messages est manquante`);
                    debug(`Propriétés du canal: ${JSON.stringify(channelData, null, 2)}`);

                }
                const loadThreadMessages = async (): Promise<void> => {
                    if ((channelData as TextChannelData).threads && (channelData as TextChannelData).threads.length > 0) {
                        // Vérifier si le canal a la propriété threads
                        if (!(channel as any).threads) {
                            debug('Le canal ne supporte pas les threads');
                            return;
                        }

                        await Promise.all((channelData as TextChannelData).threads.map(async (threadData) => {
                            let autoArchiveDuration = threadData.autoArchiveDuration;
                            //if (!guild.features.includes('SEVEN_DAY_THREAD_ARCHIVE') && autoArchiveDuration === 10080) autoArchiveDuration = 4320;
                            //if (!guild.features.includes('THREE_DAY_THREAD_ARCHIVE') && autoArchiveDuration === 4320) autoArchiveDuration = 1440;

                            try {
                                // Vérifier si le thread existe déjà
                                const existingThread = (channel as any).threads && (channel as any).threads.cache ?
                                    (channel as any).threads.cache.find((t: any) => t.name === threadData.name) : null;

                                if (existingThread) {
                                    await loadMessages(existingThread, threadData.messages, webhook);
                                } else if ((channel as any).threads && (channel as any).threads.create) {
                                    // Créer un nouveau thread
                                    const newThread = await (channel as any).threads.create({
                                        name: threadData.name,
                                        autoArchiveDuration
                                    });
                                    await loadMessages(newThread, threadData.messages, webhook);
                                }
                            } catch (error) {
                            }
                        }));
                    }
                }
                await loadThreadMessages();
                return channel;
            } else {
                resolve(channel); // Return the channel
            }
        });
    });
}

/**
 * Delete all roles, all channels, all emojis, etc... of a guild
 */
export async function clearGuild(guild: InstanceType<GuildType>) {
    // Delete roles
    guild.roles.cache
        .filter((role: any) => role.editable && role.id !== guild.id)
        .forEach(async (role: any) => {
            try {
                await role.delete();
            } catch { }
        });
    // Delete channels
    guild.channels.cache.forEach(async (channel: any) => {
        try {
            await channel.delete();
        } catch { }
    });
    // Delete emojis
    guild.emojis.cache.forEach(async (emoji: any) => {
        try {
            await emoji.delete();
        } catch { }
    });
    // Delete webhooks
    const webhooks = await guild.fetchWebhooks();
    webhooks.forEach(async (webhook: any) => {
        await webhook.delete();
    });
    // Unban members
    const bans = await guild.bans.fetch();
    bans.forEach(async (ban: any) => {
        await guild.members.unban(ban.user.id);
    });
    guild.setAFKChannel(null);
    guild.setAFKTimeout(60 * 5);
    guild.setIcon(null);
    guild.setBanner(null).catch(() => { });
    guild.setSplash(null).catch(() => { });
    guild.setDefaultMessageNotifications(GuildDefaultMessageNotifications.OnlyMentions);
    guild.setWidgetSettings({
        enabled: false,
        channel: null
    });
    if (!guild.features.includes(GuildFeature.Community)) {
        guild.setExplicitContentFilter(GuildExplicitContentFilter.Disabled);
        guild.setVerificationLevel(GuildVerificationLevel.None);
    }
    guild.setSystemChannel(null);
    guild.setSystemChannelFlags([GuildSystemChannelFlags.SuppressGuildReminderNotifications, GuildSystemChannelFlags.SuppressJoinNotifications, GuildSystemChannelFlags.SuppressPremiumSubscriptions]);
    return;
}
