
const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const http = require('node:http');

const TOKEN = process.env.TOKEN;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const API_SECRET = process.env.API_SECRET;

if (!TOKEN || !APPS_SCRIPT_URL || !API_SECRET) {
  console.error('缺少必要的 Render 環境變數');
  process.exit(1);
}

// 四個打卡頻道
const CHANNELS = {
  LV: '1536948264954236998',
  LT: '1554087224973197323',
  MMC: '1554087319450030140',
  SHARED: '1554087992279433266'
};

// LS / LU 身份組
const ROLES = {
  LS: '1492097004443009034',
  LU: '1536988398143668265'
};

// 只保留四個按鈕
const BUTTONS = [
  {
    id: 'START',
    label: '上班',
    emoji: '🟢',
    style: ButtonStyle.Success
  },
  {
    id: 'OFF',
    label: '下班',
    emoji: '🔴',
    style: ButtonStyle.Danger
  },
  {
    id: 'TOILET',
    label: '上廁所',
    emoji: '🚻',
    style: ButtonStyle.Primary
  },
  {
    id: 'BACK',
    label: '回座',
    emoji: '🪑',
    style: ButtonStyle.Secondary
  }
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Render 健康檢查
const PORT = Number(process.env.PORT || 10000);

http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('26 Group Attendance online');
}).listen(PORT, '0.0.0.0', () => {
  console.log('HTTP server listening:', PORT);
});

function createPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x38A58A)
    .setTitle('📋 26 GROUP｜員工考勤系統')
    .setDescription(
      '請點擊下方按鈕完成打卡。\n\n' +
      '🟢 **上班**：開始工作\n' +
      '🔴 **下班**：結束工作\n' +
      '🚻 **上廁所**：開始離座\n' +
      '🪑 **回座**：結束離座\n\n' +
      '所有記錄均使用馬來西亞時間。'
    )
    .setFooter({
      text: '26 GROUP ATTENDANCE PANEL V1'
    });

  const row = new ActionRowBuilder();

  for (const item of BUTTONS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('attendance:' + item.id)
        .setLabel(item.label)
        .setEmoji(item.emoji)
        .setStyle(item.style)
    );
  }

  return {
    embeds: [embed],
    components: [row]
  };
}

// 根據頻道和身份組判斷公司
function getCompany(interaction) {
  const channelId = interaction.channelId;

  if (channelId === CHANNELS.LV) return 'LV';
  if (channelId === CHANNELS.LT) return 'LT';
  if (channelId === CHANNELS.MMC) return 'MMC';

  if (channelId === CHANNELS.SHARED) {
    const roles = interaction.member.roles;

    const hasRole = id => {
      if (roles.cache) {
        return roles.cache.has(id);
      }

      return Array.isArray(roles) && roles.includes(id);
    };

    const isLS = hasRole(ROLES.LS);
    const isLU = hasRole(ROLES.LU);

    if (isLS && isLU) {
      throw new Error(
        '你同時擁有 LS 和 LU 身份組，請管理員確認。'
      );
    }

    if (isLS) return 'LS';
    if (isLU) return 'LU';

    throw new Error(
      '找不到 LS 或 LU 身份組，請聯絡管理員。'
    );
  }

  throw new Error('這個頻道沒有啟用考勤功能。');
}

// 向 Google Apps Script 寫入資料
async function sendAttendance(data) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 25000);

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        ...data,
        secret: API_SECRET
      }),
      redirect: 'follow',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        'Google API HTTP ' + response.status
      );
    }

    const text = await response.text();

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      console.error(
        'Google 回傳非 JSON，請檢查部署網址和權限'
      );
      throw new Error('Google API 回應格式錯誤');
    }

    return result;

  } finally {
    clearTimeout(timeout);
  }
}

// 上線時建立四個固定面板
async function setupPanels() {
  for (const [company, channelId] of Object.entries(CHANNELS)) {
    try {
      const channel = await client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        console.error(company, '不是可用的文字頻道');
        continue;
      }

      // 尋找最近 100 條訊息中的現有面板
      const messages = await channel.messages.fetch({
        limit: 100
      });

      const oldPanel = messages.find(message => {
        return (
          message.author.id === client.user.id &&
          message.embeds.some(embed =>
            embed.footer?.text ===
            '26 GROUP ATTENDANCE PANEL V1'
          )
        );
      });

      if (oldPanel) {
        await oldPanel.edit(createPanel());
        console.log(company, '沿用現有打卡面板');
      } else {
        await channel.send(createPanel());
        console.log(company, '已建立打卡面板');
      }

    } catch (error) {
      console.error(
        company,
        '建立面板失敗：',
        error.message
      );
    }
  }
}

client.once(Events.ClientReady, async readyClient => {
  console.log(
    '考勤 Bot 已上線：',
    readyClient.user.tag
  );

  await setupPanels();
});

// 處理員工點擊
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  if (!interaction.customId.startsWith('attendance:')) {
    return;
  }

  const action = interaction.customId.split(':')[1];

  if (!BUTTONS.some(item => item.id === action)) {
    return;
  }

  // 先回應 Discord，避免操作逾時
  try {
    await interaction.deferReply({
      ephemeral: true
    });
  } catch (error) {
    console.error('Discord 回應失敗：', error);
    return;
  }

  try {
    const company = getCompany(interaction);

    const result = await sendAttendance({
      eventId: interaction.id,
      company,
      action,
      discordId: interaction.user.id,
      employee:
        interaction.member?.displayName ||
        interaction.user.globalName ||
        interaction.user.username
    });

    if (!result.ok) {
      await interaction.editReply({
        content: '⚠️ ' + (
          result.message || '打卡失敗'
        )
      });
      return;
    }

    if (result.duplicate) {
      await interaction.editReply({
        content: '⚠️ 這次打卡已經記錄過。'
      });
      return;
    }

    let content =
      '✅ **' + result.message + '**\n' +
      '公司：' + result.company + '\n' +
      '員工：' + result.employee + '\n' +
      '時間：' + result.date + ' ' + result.time;

    await interaction.editReply({
      content
    });

    console.log(
      result.company,
      result.employee,
      result.action,
      result.time
    );

  } catch (error) {
    console.error('打卡錯誤：', error);

    await interaction.editReply({
      content:
        '❌ ' +
        (
          error.name === 'AbortError'
            ? '連線逾時，請聯絡管理員確認記錄。'
            : error.message
        )
    }).catch(console.error);
  }
});

client.login(TOKEN);
