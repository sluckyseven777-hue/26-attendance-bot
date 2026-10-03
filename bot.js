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
 * 26 GROUP ATTENDANCE BOT V2.1
 *
 * LV / LT / MMC / LU
 *
 * 上班：09:00
 * 上廁所：15分鐘
 * 抽煙：7分鐘
 * 外賣：10分鐘
 *******************************************************/


/*******************************************************
 * 1. Render 環境變數
 *******************************************************/

const TOKEN = process.env.TOKEN;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const API_SECRET = process.env.API_SECRET;

if (!TOKEN || !APPS_SCRIPT_URL || !API_SECRET) {
  console.error('缺少必要的 Render 環境變數');
  process.exit(1);
}


/*******************************************************
 * 2. 四個打卡頻道
 *******************************************************/

const CHANNELS = {
  LV: '1536948264954236998',
  LT: '1554087224973197323',
  MMC: '1554087319450030140',
  LU: '1554087992279433266'
};


/*******************************************************
 * 3. 按鈕設定
 *
 * 第一排：
 * 上班 / 下班 / 回座
 *
 * 第二排：
 * 上廁所 / 抽煙 / 外賣
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
 * 4. Discord Client
 *******************************************************/

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});


/*******************************************************
 * 5. Render HTTP 健康檢查
 *******************************************************/

const PORT = Number(
  process.env.PORT || 10000
);

http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8'
  });

  res.end(
    '26 Group Attendance V2.1 online'
  );

}).listen(PORT, '0.0.0.0', () => {
  console.log(
    'HTTP server listening:',
    PORT
  );
});


/*******************************************************
 * 6. 建立按鈕
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


/*******************************************************
 * 7. 建立面板
 *******************************************************/

function createPanel() {

  const embed = new EmbedBuilder()
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
        '26 GROUP ATTENDANCE｜V2.1'
    });


  // 第一排：3 個
  const row1 = new ActionRowBuilder()
    .addComponents(
      makeButton(BUTTONS.START),
      makeButton(BUTTONS.OFF),
      makeButton(BUTTONS.BACK)
    );


  // 第二排：3 個
  const row2 = new ActionRowBuilder()
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
 * 8. 頻道 → 公司
 *******************************************************/

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
 * 9. Employee Name
 *******************************************************/

function getEmployeeName(interaction) {

  return (
    interaction.member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username
  );
}


/*******************************************************
 * 10. Apps Script API
 *******************************************************/

async function sendAttendance(data) {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, 25000);


  try {

    const response = await fetch(
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
        'Google 回傳非 JSON：',
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
 * 11. 更新 Discord 面板
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
          company,
          '不是可用的文字頻道'
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
                  '26 GROUP ATTENDANCE｜V2.1'
              );
            }
          );
        });


      if (oldPanel) {

        await oldPanel.edit(
          createPanel()
        );

        console.log(
          company,
          '沿用現有打卡面板'
        );

      } else {

        await channel.send(
          createPanel()
        );

        console.log(
          company,
          '已建立打卡面板'
        );
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


/*******************************************************
 * 12. 遲到公開通報
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
      '遲到通報：',
      result.company,
      result.employee,
      result.lateMinutes +
        '分鐘'
    );

  } catch (error) {

    console.error(
      '遲到通報發送失敗：',
      error.message
    );
  }
}


/*******************************************************
 * 13. 離座超時檢查
 *******************************************************/

let checkingOverdue = false;


async function checkOverdue() {

  if (checkingOverdue) {
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
        '超時檢查失敗：',
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
            '超時通報找不到公司頻道：',
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
                  String(
                    item.company
                  ),
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


        /*
         * 不再另外使用 content: <@ID>
         *
         * Embed 裡面的 mention 已經足夠，
         * 避免畫面出現兩次 @員工。
         */

        await channel.send({
          embeds: [embed]
        });


        console.log(
          '離座超時通報：',
          item.company,
          item.employee,
          item.awayLabel,
          item.overdueMinutes +
            '分鐘'
        );

      } catch (error) {

        console.error(
          '發送超時通報失敗：',
          error.message
        );
      }
    }

  } catch (error) {

    console.error(
      '自動超時檢查錯誤：',
      error.name === 'AbortError'
        ? 'Google API timeout'
        : error.message
    );

  } finally {

    checkingOverdue = false;
  }
}


/*******************************************************
 * 14. Bot Ready
 *******************************************************/

client.once(
  Events.ClientReady,
  async readyClient => {

    console.log(
      '考勤 Bot 已上線：',
      readyClient.user.tag
    );


    await setupPanels();


    await checkOverdue();


    setInterval(
      checkOverdue,
      60 * 1000
    );


    console.log(
      '離座超時監控已啟動：每 60 秒檢查'
    );
  }
);


/*******************************************************
 * 15. Button Interaction
 *******************************************************/

client.on(
  Events.InteractionCreate,
  async interaction => {

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


    /*
     * 非常重要：
     * 一收到 Discord interaction
     * 馬上寫入 Render Log。
     */

    console.log(
      '[CLICK]',
      new Date().toISOString(),
      'User:',
      interaction.user.id,
      'Name:',
      getEmployeeName(interaction),
      'Channel:',
      interaction.channelId,
      'Action:',
      action,
      'Interaction:',
      interaction.id
    );


    /*
     * 第一時間 ACK Discord
     */

    try {

      await interaction.deferReply({
        flags:
          MessageFlags.Ephemeral
      });


      console.log(
        '[ACK]',
        interaction.id,
        action,
        'Discord 已確認'
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


      const employee =
        getEmployeeName(
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
          ok:
            result.ok,

          code:
            result.code,

          message:
            result.message
        })
      );


      /*
       * Apps Script 拒絕
       */

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


      /*
       * 重複事件
       */

      if (result.duplicate) {

        await interaction.editReply({
          content:
            '⚠️ 這次打卡已經記錄過。'
        });

        return;
      }


      /*
       * 成功私人回覆
       */

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


      /*
       * 離座開始
       */

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


      /*
       * 回座
       */

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


      /*
       * 遲到公開通報
       */

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
 * 16. Discord 錯誤監控
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
 * 17. Node 錯誤監控
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
 * 18. Login
 *******************************************************/

client.login(TOKEN);
