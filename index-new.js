const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const http = require('http');

// إعداد البوت
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// توكن البوت - يجب إضافته في الـ Secrets
const TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// نظام تخزين البيانات
class DataStorage {
    constructor() {
        this.data = {
            serverSettings: new Map(),
            maintenanceMode: new Map(),
            channelPermissions: new Map(),
            tempRooms: new Map(),
            allowedUsers: new Map(),
            pricing: new Map()
        };
        this.storageFile = 'bot_data.json';
    }

    // حفظ البيانات
    async saveData() {
        try {
            const dataToSave = {
                serverSettings: Object.fromEntries(this.data.serverSettings),
                maintenanceMode: Object.fromEntries(this.data.maintenanceMode),
                channelPermissions: Object.fromEntries(this.data.channelPermissions),
                tempRooms: Object.fromEntries(this.data.tempRooms),
                allowedUsers: Object.fromEntries(this.data.allowedUsers),
                pricing: Object.fromEntries(this.data.pricing)
            };

            // استخدام File System كبديل بسيط
            const fs = require('fs').promises;
            await fs.writeFile(this.storageFile, JSON.stringify(dataToSave, null, 2));
            console.log('تم حفظ البيانات بنجاح');
        } catch (error) {
            console.error('خطأ في حفظ البيانات:', error);
        }
    }

    // تحميل البيانات
    async loadData() {
        try {
            const fs = require('fs').promises;
            const fileContent = await fs.readFile(this.storageFile, 'utf8');
            const savedData = JSON.parse(fileContent);

            this.data.serverSettings = new Map(Object.entries(savedData.serverSettings || {}));
            this.data.maintenanceMode = new Map(Object.entries(savedData.maintenanceMode || {}));
            this.data.channelPermissions = new Map(Object.entries(savedData.channelPermissions || {}));
            this.data.tempRooms = new Map(Object.entries(savedData.tempRooms || {}));
            this.data.allowedUsers = new Map(Object.entries(savedData.allowedUsers || {}));
            this.data.pricing = new Map(Object.entries(savedData.pricing || {}));

            console.log('تم تحميل البيانات بنجاح');
        } catch (error) {
            console.log('لم يتم العثور على ملف البيانات، سيتم إنشاء واحد جديد');
        }
    }

    // حفظ تلقائي كل 5 دقائق
    startAutoSave() {
        setInterval(() => {
            this.saveData();
        }, 5 * 60 * 1000); // 5 دقائق
    }
}

// إنشاء مثيل التخزين
const storage = new DataStorage();

// الأوامر
const commands = [
    new SlashCommandBuilder()
        .setName('تفعيل-وضع-الصيانة')
        .setDescription('تفعيل وضع الصيانة - إخفاء جميع الغرف عن الجميع')
        .addBooleanOption(option =>
            option.setName('تأكيد')
                .setDescription('هل أنت متأكد من تفعيل وضع الصيانة؟')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('اطفاء-وضع-الصيانة')
        .setDescription('إطفاء وضع الصيانة - إعادة الغرف كما كانت سابقاً')
        .addBooleanOption(option =>
            option.setName('تأكيد')
                .setDescription('هل أنت متأكد من إطفاء وضع الصيانة؟')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('حالة-البيانات')
        .setDescription('عرض حالة البيانات المحفوظة'),

    new SlashCommandBuilder()
        .setName('حفظ-البيانات')
        .setDescription('حفظ البيانات يدوياً'),

    new SlashCommandBuilder()
        .setName('حذف-غرف-متعددة')
        .setDescription('حذف عدة غرف في آن واحد')
        .addStringOption(option =>
            option.setName('نمط-البحث')
                .setDescription('نمط البحث للغرف المراد حذفها')
                .setRequired(true)
                .addChoices(
                    { name: 'بداية الاسم', value: 'startsWith' },
                    { name: 'نهاية الاسم', value: 'endsWith' },
                    { name: 'يحتوي على', value: 'includes' },
                    { name: 'تطابق تام', value: 'exact' }
                ))
        .addStringOption(option =>
            option.setName('النص')
                .setDescription('النص المراد البحث عنه في أسماء الغرف')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('تأكيد')
                .setDescription('هل أنت متأكد من حذف الغرف؟ (يجب وضع True)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('نوع-الغرف')
                .setDescription('نوع الغرف المراد حذفها')
                .setRequired(false)
                .addChoices(
                    { name: 'جميع الأنواع', value: 'all' },
                    { name: 'غرف نصية فقط', value: 'text' },
                    { name: 'غرف صوتية فقط', value: 'voice' },
                    { name: 'كاتيجوريات فقط', value: 'category' }
                ))
];

// تسجيل الأوامر
async function registerCommands() {
    try {
        console.log('جاري تسجيل الأوامر...');

        const rest = new REST().setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log('تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('خطأ في تسجيل الأوامر:', error);
    }
}

// دالة لحفظ إعدادات السيرفر
function saveServerSettings(guildId, settings) {
    storage.data.serverSettings.set(guildId, { 
        ...storage.data.serverSettings.get(guildId), 
        ...settings 
    });
    storage.saveData(); // حفظ فوري
}

// دالة لجلب إعدادات السيرفر
function getServerSettings(guildId) {
    return storage.data.serverSettings.get(guildId) || {};
}

// عند جاهزية البوت
client.once('ready', async () => {
    console.log(`تم تشغيل البوت بنجاح! مسجل باسم ${client.user.tag}`);

    // تحميل البيانات المحفوظة
    await storage.loadData();

    // تنظيف البيانات المؤقتة للحذف المتعدد
    storage.data.tempChannelDelete = new Map();

    // بدء الحفظ التلقائي
    storage.startAutoSave();

    registerCommands();

    // إعداد حالة البوت
    client.user.setPresence({
        activities: [{
            name: 'نظام تخزين متقدم',
            type: 3
        }],
        status: 'online'
    });

    console.log('تم تحميل البيانات المحفوظة بنجاح');
});

// معالجة الرسائل
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // يمكنك إضافة معالجة الرسائل هنا
});

// معالجة التفاعلات
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        try {
            if (commandName === 'تفعيل-وضع-الصيانة') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const confirmed = interaction.options.getBoolean('تأكيد');
                if (!confirmed) {
                    return interaction.reply({ 
                        content: '❌ يجب تأكيد العملية بوضع "True" في خانة التأكيد!', 
                        ephemeral: true 
                    });
                }

                const guildId = interaction.guild.id;

                if (storage.data.maintenanceMode.get(guildId)) {
                    return interaction.reply({
                        content: '⚠️ وضع الصيانة مُفعل مسبقاً!',
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    const channels = interaction.guild.channels.cache.filter(channel => 
                        channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice
                    );

                    const guildPermissions = new Map();
                    let processedCount = 0;
                    let errorCount = 0;

                    for (const [channelId, channel] of channels) {
                        try {
                            // حفظ الأذونات الحالية
                            const everyoneOverwrite = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
                            const originalViewChannel = everyoneOverwrite ? everyoneOverwrite.allow.has(PermissionFlagsBits.ViewChannel) : null;

                            guildPermissions.set(channelId, {
                                hadViewChannelAllow: originalViewChannel === true,
                                hadViewChannelDeny: everyoneOverwrite ? everyoneOverwrite.deny.has(PermissionFlagsBits.ViewChannel) : false
                            });

                            // إخفاء الغرفة عن الجميع
                            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                ViewChannel: false
                            });

                            processedCount++;

                            // تأخير صغير لتجنب تجاوز حدود Discord
                            if (processedCount % 10 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }

                        } catch (error) {
                            console.error(`خطأ في إخفاء الغرفة ${channel.name}:`, error);
                            errorCount++;
                        }
                    }

                    // حفظ الأذونات وحالة الصيانة
                    storage.data.channelPermissions.set(guildId, Object.fromEntries(guildPermissions));
                    storage.data.maintenanceMode.set(guildId, true);
                    await storage.saveData();

                    let resultMessage = `🔧 تم تفعيل وضع الصيانة بنجاح!\n`;
                    resultMessage += `✅ تم إخفاء ${processedCount} غرفة\n`;
                    if (errorCount > 0) {
                        resultMessage += `⚠️ فشل في ${errorCount} غرفة\n`;
                    }
                    resultMessage += `\n🔒 جميع الغرف مخفية عن الأعضاء الآن`;
                    resultMessage += `\n💾 تم حفظ البيانات بنجاح`;

                    await interaction.editReply({ content: resultMessage });

                } catch (error) {
                    console.error('خطأ في تفعيل وضع الصيانة:', error);
                    await interaction.editReply({ content: '❌ حدث خطأ أثناء تفعيل وضع الصيانة!' });
                }

            } else if (commandName === 'اطفاء-وضع-الصيانة') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                const confirmed = interaction.options.getBoolean('تأكيد');
                if (!confirmed) {
                    return interaction.reply({ 
                        content: '❌ يجب تأكيد العملية بوضع "True" في خانة التأكيد!', 
                        ephemeral: true 
                    });
                }

                const guildId = interaction.guild.id;

                if (!storage.data.maintenanceMode.get(guildId)) {
                    return interaction.reply({
                        content: '⚠️ وضع الصيانة غير مُفعل!',
                        ephemeral: true
                    });
                }

                const savedPermissions = storage.data.channelPermissions.get(guildId);
                if (!savedPermissions) {
                    return interaction.reply({
                        content: '❌ لم يتم العثور على الأذونات المحفوظة! لا يمكن استعادة الحالة السابقة.',
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    const channels = interaction.guild.channels.cache.filter(channel => 
                        channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice
                    );

                    let restoredCount = 0;
                    let errorCount = 0;

                    for (const [channelId, channel] of channels) {
                        try {
                            const savedPerm = savedPermissions[channelId];
                            if (savedPerm) {
                                if (savedPerm.hadViewChannelAllow) {
                                    // كانت الغرفة مفتوحة صراحة
                                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                        ViewChannel: true
                                    });
                                } else if (savedPerm.hadViewChannelDeny) {
                                    // كانت الغرفة مخفية أصلاً
                                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                        ViewChannel: false
                                    });
                                } else {
                                    // لم تكن هناك أذونات صريحة، إزالة الحظر
                                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                        ViewChannel: null
                                    });
                                }
                            } else {
                                // إذا لم تكن محفوظة، إزالة الحظر
                                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                    ViewChannel: null
                                });
                            }

                            restoredCount++;

                            // تأخير صغير لتجنب تجاوز حدود Discord
                            if (restoredCount % 10 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }

                        } catch (error) {
                            console.error(`خطأ في استعادة الغرفة ${channel.name}:`, error);
                            errorCount++;
                        }
                    }

                    // إزالة حالة الصيانة والأذونات المحفوظة
                    storage.data.maintenanceMode.set(guildId, false);
                    storage.data.channelPermissions.delete(guildId);
                    await storage.saveData();

                    let resultMessage = `🔧 تم إطفاء وضع الصيانة بنجاح!\n`;
                    resultMessage += `✅ تم استعادة ${restoredCount} غرفة\n`;
                    if (errorCount > 0) {
                        resultMessage += `⚠️ فشل في ${errorCount} غرفة\n`;
                    }
                    resultMessage += `\n🔓 تم إعادة جميع الغرف كما كانت سابقاً`;
                    resultMessage += `\n💾 تم حفظ البيانات بنجاح`;

                    await interaction.editReply({ content: resultMessage });

                } catch (error) {
                    console.error('خطأ في إطفاء وضع الصيانة:', error);
                    await interaction.editReply({ content: '❌ حدث خطأ أثناء إطفاء وضع الصيانة!' });
                }

            } else if (commandName === 'حالة-البيانات') {
                const embed = new EmbedBuilder()
                    .setTitle('📊 حالة البيانات المحفوظة')
                    .setColor(0x00AE86)
                    .addFields(
                        { name: '🗄️ إعدادات السيرفرات', value: `${storage.data.serverSettings.size} سيرفر`, inline: true },
                        { name: '🔧 وضع الصيانة', value: `${Array.from(storage.data.maintenanceMode.values()).filter(m => m).length} سيرفر مُفعل`, inline: true },
                        { name: '🔐 أذونات الغرف', value: `${storage.data.channelPermissions.size} سيرفر محفوظ`, inline: true },
                        { name: '🏠 الغرف المؤقتة', value: `${storage.data.tempRooms.size} غرفة`, inline: true },
                        { name: '👥 المستخدمين المسموحين', value: `${storage.data.allowedUsers.size} سيرفر`, inline: true },
                        { name: '💰 إعدادات التسعير', value: `${storage.data.pricing.size} سيرفر`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'يتم الحفظ التلقائي كل 5 دقائق' });

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } else if (commandName === 'حفظ-البيانات') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }

                await storage.saveData();
                await interaction.reply({ 
                    content: '💾 تم حفظ البيانات بنجاح!', 
                    ephemeral: true 
                });

            } else if (commandName === 'حذف-غرف-متعددة') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ 
                        content: '❌ ليس لديك صلاحية إدارة الغرف!', 
                        ephemeral: true 
                    });
                }

                const searchPattern = interaction.options.getString('نمط-البحث');
                const searchText = interaction.options.getString('النص');
                const confirmed = interaction.options.getBoolean('تأكيد');
                const channelType = interaction.options.getString('نوع-الغرف') || 'all';

                if (!confirmed) {
                    return interaction.reply({
                        content: '❌ يجب تأكيد العملية بوضع "True" في خانة التأكيد!',
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    // جلب جميع الغرف
                    let channels = interaction.guild.channels.cache;

                    // تصفية حسب نوع الغرف
                    if (channelType !== 'all') {
                        channels = channels.filter(channel => {
                            switch (channelType) {
                                case 'text':
                                    return channel.type === ChannelType.GuildText;
                                case 'voice':
                                    return channel.type === ChannelType.GuildVoice;
                                case 'category':
                                    return channel.type === ChannelType.GuildCategory;
                                default:
                                    return true;
                            }
                        });
                    }

                    // تصفية حسب نمط البحث
                    const channelsToDelete = channels.filter(channel => {
                        const channelName = channel.name.toLowerCase();
                        const searchTextLower = searchText.toLowerCase();

                        switch (searchPattern) {
                            case 'startsWith':
                                return channelName.startsWith(searchTextLower);
                            case 'endsWith':
                                return channelName.endsWith(searchTextLower);
                            case 'includes':
                                return channelName.includes(searchTextLower);
                            case 'exact':
                                return channelName === searchTextLower;
                            default:
                                return false;
                        }
                    });

                    if (channelsToDelete.size === 0) {
                        return interaction.editReply({
                            content: '🔍 لم يتم العثور على أي غرف تطابق معايير البحث المحددة!'
                        });
                    }

                    // تحديد أنواع الغرف الموجودة
                    const channelTypes = {
                        text: 0,
                        voice: 0,
                        category: 0,
                        other: 0
                    };

                    channelsToDelete.forEach(channel => {
                        switch (channel.type) {
                            case ChannelType.GuildText:
                                channelTypes.text++;
                                break;
                            case ChannelType.GuildVoice:
                                channelTypes.voice++;
                                break;
                            case ChannelType.GuildCategory:
                                channelTypes.category++;
                                break;
                            default:
                                channelTypes.other++;
                        }
                    });

                    // عرض معاينة قبل الحذف
                    const previewEmbed = new EmbedBuilder()
                        .setTitle('⚠️ معاينة الغرف المراد حذفها')
                        .setColor(0xFF0000)
                        .addFields(
                            { name: '📊 إجمالي الغرف', value: `${channelsToDelete.size} غرفة`, inline: true },
                            { name: '📝 غرف نصية', value: `${channelTypes.text}`, inline: true },
                            { name: '🔊 غرف صوتية', value: `${channelTypes.voice}`, inline: true },
                            { name: '📁كاتيجوريات', value: `${channelTypes.category}`, inline: true },
                            { name: '❓ أخرى', value: `${channelTypes.other}`, inline: true },
                            { name: '🔍 نمط البحث', value: `${searchPattern} - "${searchText}"`, inline: false }
                        )
                        .setDescription(`الغرف التي سيتم حذفها:\n${channelsToDelete.map(ch => `• ${ch.name} (${ch.type === ChannelType.GuildText ? 'نصية' : ch.type === ChannelType.GuildVoice ? 'صوتية' : 'كاتيجوري'})`).slice(0, 10).join('\n')}${channelsToDelete.size > 10 ? `\n... و ${channelsToDelete.size - 10} غرفة أخرى` : ''}`)
                        .setTimestamp();

                    // إنشاء أزرار التأكيد
                    const confirmRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('confirm_delete_channels')
                                .setLabel('تأكيد الحذف')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('cancel_delete_channels')
                                .setLabel('إلغاء')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    // حفظ بيانات العملية مؤقتاً
                    storage.data.tempChannelDelete = storage.data.tempChannelDelete || new Map();
                    storage.data.tempChannelDelete.set(interaction.user.id, {
                        channels: Array.from(channelsToDelete.keys()),
                        guildId: interaction.guild.id,
                        timestamp: Date.now()
                    });

                    await interaction.editReply({
                        embeds: [previewEmbed],
                        components: [confirmRow]
                    });

                } catch (error) {
                    console.error('خطأ في معاينة حذف الغرف:', error);
                    await interaction.editReply({
                        content: '❌ حدث خطأ أثناء معاينة الغرف المراد حذفها!'
                    });
                }
            }

        } catch (error) {
            console.error('خطأ في معالجة الأمر:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ حدث خطأ أثناء تنفيذ الأمر!',
                    ephemeral: true
                });
            }
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'confirm_delete_channels') {
            const deleteData = storage.data.tempChannelDelete?.get(interaction.user.id);

            if (!deleteData || Date.now() - deleteData.timestamp > 300000) { // 5 دقائق
                return interaction.reply({
                    content: '❌ انتهت صلاحية العملية! يرجى تنفيذ الأمر مرة أخرى.',
                    ephemeral: true
                });
            }

            if (deleteData.guildId !== interaction.guild.id) {
                return interaction.reply({
                    content: '❌ لا يمكن تنفيذ هذه العملية في هذا السيرفر!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let failedCount = 0;
                const failedChannels = [];

                for (const channelId of deleteData.channels) {
                    try {
                        const channel = interaction.guild.channels.cache.get(channelId);
                        if (channel) {
                            await channel.delete('حذف متعدد بواسطة البوت');
                            deletedCount++;

                            // تأخير صغير لتجنب تجاوز حدود Discord
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                    } catch (error) {
                        failedCount++;
                        failedChannels.push(channelId);
                        console.error(`فشل في حذف الغرفة ${channelId}:`, error);
                    }
                }

                // تنظيف البيانات المؤقتة
                storage.data.tempChannelDelete.delete(interaction.user.id);

                let resultMessage = `🗑️ **تم تنفيذ عملية الحذف**\n\n`;
                resultMessage += `✅ تم حذف: ${deletedCount} غرفة\n`;
                if (failedCount > 0) {
                    resultMessage += `❌ فشل في حذف: ${failedCount} غرفة\n`;
                    resultMessage += `\n**الأسباب المحتملة للفشل:**\n`;
                    resultMessage += `• نقص في الصلاحيات\n`;
                    resultMessage += `• حماية Discord للغرف\n`;
                    resultMessage += `• غرف محذوفة مسبقاً`;
                }

                await interaction.editReply({ 
                    content: resultMessage,
                    embeds: [],
                    components: []
                });

                // تحديث الرسالة الأصلية
                try {
                    await interaction.message.edit({
                        content: '✅ تم تنفيذ عملية الحذف',
                        embeds: [],
                        components: []
                    });
                } catch (e) {
                    // تجاهل خطأ تحديث الرسالة الأصلية
                }

            } catch (error) {
                console.error('خطأ في حذف الغرف:', error);
                await interaction.editReply({
                    content: '❌ حدث خطأ أثناء حذف الغرف!'
                });
            }

        } else if (interaction.customId === 'cancel_delete_channels') {
            // تنظيف البيانات المؤقتة
            storage.data.tempChannelDelete?.delete(interaction.user.id);

            await interaction.update({
                content: '❌ تم إلغاء عملية حذف الغرف',
                embeds: [],
                components: []
            });
        }
    }
});

// حفظ البيانات عند إغلاق البوت
process.on('SIGINT', async () => {
    console.log('جاري إيقاف البوت وحفظ البيانات...');
    await storage.saveData();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('جاري إيقاف البوت وحفظ البيانات...');
    await storage.saveData();
    process.exit(0);
});

// معالجة الأخطاء
client.on('error', error => {
    console.error('خطأ في البوت:', error);
});

// إعداد خادم HTTP
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🤖 Discord Bot is running!\nبوت ديسكورد يعمل بنجاح مع نظام التخزين!');
});

const PORT = process.env.PORT || 5001; // استخدام بورت مختلف
server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server is running on port ${PORT}`);
});

// تشغيل البوت
if (TOKEN && CLIENT_ID) {
    client.login(TOKEN);
} else {
    console.error('يرجى إضافة DISCORD_TOKEN و CLIENT_ID في الـ Secrets!');
}