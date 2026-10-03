const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const http = require('node:http');


/*******************************************************
 * 26 GROUP ATTENDANCE BOT V2.2 STABLE
 *
 * LV / LT / MMC / LU
 *
 * 上班：09:00
 * 上廁所：15分鐘
 * 抽煙：7分鐘
 * 外賣：10分鐘
 *
 * V2.2：
 * - Discord Gateway 狀態監控
 * - Gateway 斷線自動恢復
 * - 長時間失聯自動退出，交給 Render 重啟
 * - Interaction 詳細診斷
 * - Apps Script timeout
 * - 超時監控防重疊
 *******************************************************/


/*******************************************************
 * 1. Environment
 *******************************************************/

const TOKEN = process.env.TOKEN;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const API_SECRET = process.env.API_SECRET;

if (!TOKEN || !APPS_SCRIPT_URL || !API_SECRET) {
  console.error('[FATAL] 缺少必要的 Render 環境變數');
  process.exit(1);
}


/*******************************************************
 * 2. Channels
 *******************************************************/

const CHANNELS = {
  LV: '1536948264954236998',
  LT: '1554087224973197323',
  MMC: '1554087319450030140',
  LU: '1554087992279433266'
};


/*******************************************************
 * 3. Buttons
 *******************************************************/

const BUTTONS = {
  START: {
    id: 'START',
    label: '上班',
    emoji: '🟢',
    style: ButtonStyle.Success
  },

  OFF: {
    id: 'OFF',
    label: '下班',
    emoji: '🔴',
    style: ButtonStyle.Danger
  },

  BACK: {
    id: 'BACK',
    label: '回座',
    emoji: '🪑',
    style: ButtonStyle.Success
  },

  TOILET: {
    id: 'TOILET',
    label: '上廁所',
    emoji: '🚻',
    style: ButtonStyle.Primary
  },

  SMOKE: {
    id: 'SMOKE',
    label: '抽煙',
    emoji: '🚬',
    style: ButtonStyle.Secondary
  },

  TAKEAWAY: {
    id: 'TAKEAWAY',
    label: '外賣',
    emoji: '🥡',
    style: ButtonStyle.Primary
  }
};


/*******************************************************
 * 4. Client
 *******************************************************/

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});


/*******************************************************
 * 5. Runtime State
 *******************************************************/

let discordReady = false;
let lastReadyAt = 0;
let lastGatewayActivity = Date.now();

let checkingOverdue = false;
let shuttingDown = false;


/*
 * Discord Gateway 如果斷線後長時間沒有恢復，
 * 主動結束 Node，Render 會重新啟動服務。
 *
 * 不要設太短。
 */
const GATEWAY_RECOVERY_TIMEOUT =
  3 * 60 * 1000;


/*******************************************************
 * 6. HTTP Server
 *******************************************************/

const PORT =
  Number(process.env.PORT || 10000);

http.createServer((req, res) => {

  const body = JSON.stringify({
    service: '26 Group Attendance',
    version: 'V2.2-STABLE',
    http: 'ONLINE',
    discord:
      discordReady
        ? 'READY'
        : 'NOT_READY',
    uptimeSeconds:
      Math.floor(process.uptime())
  });

  res.writeHead(200, {
    'Content-Type':
      'application/json; charset=utf-8'
  });

  res.end(body);

}).listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      '[HTTP] listening:',
      PORT
    );
  }
);


/*******************************************************
 * 7. Helpers
 *******************************************************/

function makeButton(item) {

  return new ButtonBuilder()
    .setCustomId(
      'attendance:' + item.id
    )
    .setLabel(item.label)
    .setEmoji(item.emoji)
    .setStyle(item.style);
}


function getEmployeeName(interaction) {

  return (
    interaction.member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username
  );
}


function getCompany(interaction) {

  const channelId =
    interaction.channelId;

  if (channelId === CHANNELS.LV) {
    return 'LV';
  }

  if (channelId === CHANNELS.LT) {
    return 'LT';
  }

  if (channelId === CHANNELS.MMC) {
    return 'MMC';
  }

  if (channelId === CHANNELS.LU) {
    return 'LU';
  }

  throw new Error(
    '這個頻道沒有啟用考勤功能。'
  );
}


/*******************************************************
 * 8. Panel
 *******************************************************/

function createPanel() {

  const embed =
    new EmbedBuilder()

      .setColor(0x38A58A)

      .setTitle(
        '📋 26 GROUP｜員工考勤'
      )

      .setDescription(
        '**上班考勤**\n' +
        '🟢 上班　09:00 前完成打卡\n' +
        '🔴 下班　結束當日工作\n' +
        '🪑 回座　結束目前離座\n\n' +

        '**離座時間**\n' +
        '🚻 上廁所　15 分鐘\n' +
        '🚬 抽煙　7 分鐘\n' +
        '🥡 外賣　10 分鐘\n\n' +

        '⚠️ 09:00 後上班將記錄遲到\n' +
        '⚠️ 離座超時將自動公開通報\n\n' +

        '🕒 Malaysia Time'
      )

      .setFooter({
        text:
          '26 GROUP ATTENDANCE｜V2.2'
      });


  const row1 =
    new ActionRowBuilder()
      .addComponents(
        makeButton(BUTTONS.START),
        makeButton(BUTTONS.OFF),
        makeButton(BUTTONS.BACK)
      );


  const row2 =
    new ActionRowBuilder()
      .addComponents(
        makeButton(BUTTONS.TOILET),
        makeButton(BUTTONS.SMOKE),
        makeButton(BUTTONS.TAKEAWAY)
      );


  return {
    embeds: [embed],
    components: [
      row1,
      row2
    ]
  };
}


/*******************************************************
 * 9. Apps Script API
 *******************************************************/

async function sendAttendance(data) {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      25000
    );

  try {

    const response =
      await fetch(
        APPS_SCRIPT_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'text/plain;charset=utf-8'
          },

          body: JSON.stringify({
            ...data,
            secret: API_SECRET
          }),

          redirect: 'follow',

          signal: controller.signal
        }
      );


    if (!response.ok) {

      throw new Error(
        'Google API HTTP ' +
        response.status
      );
    }


    const text =
      await response.text();


    try {

      return JSON.parse(text);

    } catch {

      console.error(
        '[API NON JSON]',
        text.slice(0, 300)
      );

      throw new Error(
        'Google API 回應格式錯誤'
      );
    }

  } finally {

    clearTimeout(timeout);
  }
}


/*******************************************************
 * 10. Setup Panels
 *******************************************************/

async function setupPanels() {

  for (
    const [company, channelId]
    of Object.entries(CHANNELS)
  ) {

    try {

      const channel =
        await client.channels.fetch(
          channelId
        );


      if (
        !channel ||
        !channel.isTextBased()
      ) {

        console.error(
          '[PANEL]',
          company,
          '不是文字頻道'
        );

        continue;
      }


      const messages =
        await channel.messages.fetch({
          limit: 100
        });


      const oldPanel =
        messages.find(message => {

          if (
            message.author.id !==
            client.user.id
          ) {
            return false;
          }


          return message.embeds.some(
            embed => {

              const footer =
                embed.footer?.text || '';

              return (
                footer ===
                  '26 GROUP ATTENDANCE PANEL V1' ||

                footer ===
                  '26 GROUP ATTENDANCE PANEL V2' ||

                footer ===
                  '26 GROUP ATTENDANCE｜V2.1' ||

                footer ===
                  '26 GROUP ATTENDANCE｜V2.2'
              );
            }
          );
        });


      if (oldPanel) {

        await oldPanel.edit(
          createPanel()
        );

        console.log(
          '[PANEL]',
          company,
          '沿用現有面板'
        );

      } else {

        await channel.send(
          createPanel()
        );

        console.log(
          '[PANEL]',
          company,
          '建立新面板'
        );
      }

    } catch (error) {

      console.error(
        '[PANEL ERROR]',
        company,
        error.message
      );
    }
  }
}


/*******************************************************
 * 11. Late Notice
 *******************************************************/

async function sendLateNotice(
  interaction,
  result
) {

  try {

    const channel =
      interaction.channel;


    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return;
    }


    const embed =
      new EmbedBuilder()

        .setColor(0xE67E22)

        .setTitle(
          '⚠️ 員工遲到通報'
        )

        .setDescription(
          '<@' +
          interaction.user.id +
          '> 上班打卡遲到。'
        )

        .addFields(
          {
            name: '公司',
            value:
              String(result.company),
            inline: true
          },

          {
            name: '規定時間',
            value: '09:00',
            inline: true
          },

          {
            name: '實際打卡',
            value:
              String(result.time),
            inline: true
          },

          {
            name: '遲到時間',
            value:
              String(
                result.lateMinutes
              ) +
              ' 分鐘',
            inline: true
          }
        )

        .setFooter({
          text:
            '26 GROUP ATTENDANCE'
        });


    await channel.send({
      embeds: [embed]
    });


    console.log(
      '[LATE]',
      result.company,
      result.employee,
      result.lateMinutes +
        '分鐘'
    );

  } catch (error) {

    console.error(
      '[LATE ERROR]',
      error.message
    );
  }
}


/*******************************************************
 * 12. Overdue Check
 *******************************************************/

async function checkOverdue() {

  if (
    checkingOverdue ||
    !discordReady
  ) {
    return;
  }


  checkingOverdue = true;


  try {

    const result =
      await sendAttendance({
        operation:
          'CHECK_OVERDUE'
      });


    if (!result.ok) {

      console.error(
        '[OVERDUE API ERROR]',
        result.message
      );

      return;
    }


    if (
      !Array.isArray(
        result.overdue
      ) ||
      result.overdue.length === 0
    ) {
      return;
    }


    for (
      const item
      of result.overdue
    ) {

      try {

        const channelId =
          CHANNELS[item.company];


        if (!channelId) {

          console.error(
            '[OVERDUE CHANNEL ERROR]',
            item.company
          );

          continue;
        }


        const channel =
          await client.channels.fetch(
            channelId
          );


        if (
          !channel ||
          !channel.isTextBased()
        ) {
          continue;
        }


        const embed =
          new EmbedBuilder()

            .setColor(0xE74C3C)

            .setTitle(
              '🚨 員工離座超時通報'
            )

            .setDescription(
              '<@' +
              item.discordId +
              '> 已超過規定離座時間。'
            )

            .addFields(
              {
                name: '公司',
                value:
                  String(item.company),
                inline: true
              },

              {
                name: '類型',
                value:
                  String(
                    item.awayLabel
                  ),
                inline: true
              },

              {
                name: '開始時間',
                value:
                  String(
                    item.startTime
                  ),
                inline: true
              },

              {
                name: '規定時間',
                value:
                  String(
                    item.limitMinutes
                  ) +
                  ' 分鐘',
                inline: true
              },

              {
                name: '目前已離座',
                value:
                  String(
                    item.elapsedMinutes
                  ) +
                  ' 分鐘',
                inline: true
              },

              {
                name: '目前超時',
                value:
                  String(
                    item.overdueMinutes
                  ) +
                  ' 分鐘',
                inline: true
              }
            )

            .setFooter({
              text:
                '26 GROUP ATTENDANCE｜自動超時監控'
            });


        await channel.send({
          embeds: [embed]
        });


        console.log(
          '[OVERDUE]',
          item.company,
          item.employee,
          item.awayLabel,
          item.overdueMinutes +
            '分鐘'
        );

      } catch (error) {

        console.error(
          '[OVERDUE SEND ERROR]',
          error.message
        );
      }
    }

  } catch (error) {

    console.error(
      '[OVERDUE ERROR]',
      error.name === 'AbortError'
        ? 'Google API timeout'
        : error.message
    );

  } finally {

    checkingOverdue = false;
  }
}


/*******************************************************
 * 13. Discord Ready
 *******************************************************/

client.once(
  Events.ClientReady,
  async readyClient => {

    discordReady = true;

    lastReadyAt =
      Date.now();

    lastGatewayActivity =
      Date.now();


    console.log(
      '[GATEWAY READY]',
      readyClient.user.tag
    );


    await setupPanels();


    await checkOverdue();


    console.log(
      '[MONITOR] 離座超時監控啟動'
    );
  }
);


/*******************************************************
 * 14. Gateway Monitoring
 *******************************************************/

client.on(
  'shardReady',
  shardId => {

    discordReady = true;

    lastReadyAt =
      Date.now();

    lastGatewayActivity =
      Date.now();


    console.log(
      '[SHARD READY]',
      shardId
    );
  }
);


client.on(
  'shardResume',
  (
    shardId,
    replayedEvents
  ) => {

    discordReady = true;

    lastGatewayActivity =
      Date.now();


    console.log(
      '[GATEWAY RESUMED]',
      'Shard:',
      shardId,
      'Replayed:',
      replayedEvents
    );
  }
);


client.on(
  'shardDisconnect',
  (
    event,
    shardId
  ) => {

    discordReady = false;

    lastGatewayActivity =
      Date.now();


    console.error(
      '[GATEWAY DISCONNECT]',
      'Shard:',
      shardId,
      'Code:',
      event?.code,
      'Reason:',
      event?.reason || ''
    );
  }
);


client.on(
  'shardReconnecting',
  shardId => {

    discordReady = false;

    lastGatewayActivity =
      Date.now();


    console.log(
      '[GATEWAY RECONNECTING]',
      'Shard:',
      shardId
    );
  }
);


client.on(
  'shardError',
  (
    error,
    shardId
  ) => {

    lastGatewayActivity =
      Date.now();


    console.error(
      '[GATEWAY ERROR]',
      'Shard:',
      shardId,
      error.message
    );
  }
);


/*******************************************************
 * 15. Button Interaction
 *******************************************************/

client.on(
  Events.InteractionCreate,
  async interaction => {

    lastGatewayActivity =
      Date.now();


    if (!interaction.isButton()) {
      return;
    }


    if (
      !interaction.customId
        .startsWith(
          'attendance:'
        )
    ) {
      return;
    }


    const action =
      interaction.customId
        .split(':')[1];


    if (!BUTTONS[action]) {
      return;
    }


    const employee =
      getEmployeeName(
        interaction
      );


    console.log(
      '[CLICK]',
      'User:',
      interaction.user.id,
      'Name:',
      employee,
      'Channel:',
      interaction.channelId,
      'Action:',
      action,
      'Interaction:',
      interaction.id
    );


    /*
     * Discord ACK
     */
    try {

      await interaction.deferReply({
        flags:
          MessageFlags.Ephemeral
      });


      console.log(
        '[ACK]',
        interaction.id,
        action
      );

    } catch (error) {

      console.error(
        '[ACK FAILED]',
        interaction.id,
        action,
        error.message
      );

      return;
    }


    try {

      const company =
        getCompany(
          interaction
        );


      console.log(
        '[API START]',
        interaction.id,
        company,
        employee,
        action
      );


      const result =
        await sendAttendance({
          eventId:
            interaction.id,

          company:
            company,

          action:
            action,

          discordId:
            interaction.user.id,

          employee:
            employee
        });


      console.log(
        '[API RESULT]',
        interaction.id,
        JSON.stringify({
          ok: result.ok,
          code: result.code,
          message: result.message
        })
      );


      if (!result.ok) {

        await interaction.editReply({
          content:
            '⚠️ ' +
            (
              result.message ||
              '打卡失敗'
            )
        });

        return;
      }


      if (result.duplicate) {

        await interaction.editReply({
          content:
            '⚠️ 這次打卡已經記錄過。'
        });

        return;
      }


      let content =
        '✅ **' +
        result.message +
        '**\n' +

        '公司：' +
        result.company +
        '\n' +

        '員工：' +
        result.employee +
        '\n' +

        '時間：' +
        result.date +
        ' ' +
        result.time;


      if (
        action === 'TOILET' ||
        action === 'SMOKE' ||
        action === 'TAKEAWAY'
      ) {

        content +=
          '\n限時：' +
          result.awayLimit +
          ' 分鐘';
      }


      if (
        action === 'BACK' &&
        result.durationMinutes !== ''
      ) {

        content +=
          '\n離座時間：' +
          result.durationMinutes +
          ' 分鐘';


        if (
          result.overdue === true
        ) {

          content +=
            '\n超時：' +
            result.overdueMinutes +
            ' 分鐘';
        }
      }


      await interaction.editReply({
        content: content
      });


      console.log(
        '[DONE]',
        interaction.id,
        result.company,
        result.employee,
        result.action,
        result.time
      );


      if (
        action === 'START' &&
        result.late === true
      ) {

        await sendLateNotice(
          interaction,
          result
        );
      }

    } catch (error) {

      console.error(
        '[INTERACTION ERROR]',
        interaction.id,
        action,
        error
      );


      await interaction
        .editReply({
          content:
            '❌ ' +
            (
              error.name ===
                'AbortError'
                ? '連線逾時，請聯絡管理員確認記錄。'
                : error.message
            )
        })
        .catch(error2 => {

          console.error(
            '[EDIT REPLY FAILED]',
            interaction.id,
            error2.message
          );
        });
    }
  }
);


/*******************************************************
 * 16. 每分鐘工作
 *******************************************************/

setInterval(
  async () => {

    if (discordReady) {

      await checkOverdue();
    }

  },
  60 * 1000
);


/*******************************************************
 * 17. Gateway Watchdog
 *
 * 每 30 秒檢查 Discord Client 狀態。
 *
 * 如果 Discord 明確不是 Ready，
 * 且超過 3 分鐘仍沒有恢復，
 * 主動退出。
 *
 * Render 會依服務設定重新啟動 Node。
 *******************************************************/

setInterval(
  () => {

    const now =
      Date.now();


    const wsStatus =
      client.ws?.status;


    const isReady =
      client.isReady();


    console.log(
      '[HEARTBEAT]',
      'Discord:',
      isReady
        ? 'READY'
        : 'NOT_READY',
      'WS:',
      wsStatus,
      'Uptime:',
      Math.floor(
        process.uptime()
      ) + 's'
    );


    if (isReady) {

      discordReady = true;

      lastGatewayActivity =
        now;

      return;
    }


    discordReady = false;


    const downFor =
      now -
      lastGatewayActivity;


    console.error(
      '[GATEWAY NOT READY]',
      'Down:',
      Math.floor(
        downFor / 1000
      ),
      'seconds'
    );


    if (
      downFor >=
      GATEWAY_RECOVERY_TIMEOUT
    ) {

      console.error(
        '[FATAL] Discord Gateway 超過 3 分鐘未恢復，重新啟動服務'
      );


      gracefulRestart(
        'Gateway recovery timeout'
      );
    }

  },
  30 * 1000
);


/*******************************************************
 * 18. Discord Client Error
 *******************************************************/

client.on(
  Events.Error,
  error => {

    console.error(
      '[DISCORD CLIENT ERROR]',
      error
    );
  }
);


/*******************************************************
 * 19. Node Error
 *******************************************************/

process.on(
  'unhandledRejection',
  error => {

    console.error(
      '[UNHANDLED REJECTION]',
      error
    );
  }
);


process.on(
  'uncaughtException',
  error => {

    console.error(
      '[UNCAUGHT EXCEPTION]',
      error
    );
  }
);


/*******************************************************
 * 20. Graceful Restart
 *******************************************************/

async function gracefulRestart(
  reason
) {

  if (shuttingDown) {
    return;
  }


  shuttingDown = true;


  console.error(
    '[RESTART]',
    reason
  );


  try {

    client.destroy();

  } catch (error) {

    console.error(
      '[DESTROY ERROR]',
      error.message
    );
  }


  setTimeout(
    () => {

      process.exit(1);

    },
    1500
  );
}


/*******************************************************
 * 21. Login
 *******************************************************/

console.log(
  '[BOOT] 26 GROUP ATTENDANCE V2.2 STABLE'
);

client.login(TOKEN)
  .catch(error => {

    console.error(
      '[LOGIN FAILED]',
      error
    );

    process.exit(1);
  });
