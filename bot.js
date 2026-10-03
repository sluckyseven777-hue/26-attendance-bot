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
 * 26 GROUP ATTENDANCE BOT V2
 *
 * 公司：
 * LV / LT / MMC / LU
 *
 * 上班：
 * 09:00:00 或以前 = 正常
 * 09:00:01 以後 = 遲到
 *
 * 離崗：
 * 上廁所 = 15 分鐘
 * 抽煙   = 7 分鐘
 * 外賣   = 10 分鐘
 *
 * 超時：
 * Bot 每分鐘向 Apps Script 檢查
 * 同一筆超時只公開通報一次
 *******************************************************/


/*******************************************************
 * 1. Render 環境變數
 *******************************************************/

const TOKEN = process.env.TOKEN;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const API_SECRET = process.env.API_SECRET;

if (
  !TOKEN ||
  !APPS_SCRIPT_URL ||
  !API_SECRET
) {
  console.error(
    '缺少必要的 Render 環境變數'
  );

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
 * 3. 按鈕
 *******************************************************/

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
    id: 'SMOKE',
    label: '抽煙',
    emoji: '🚬',
    style: ButtonStyle.Secondary
  },

  {
    id: 'TAKEAWAY',
    label: '外賣',
    emoji: '🥡',
    style: ButtonStyle.Primary
  },

  {
    id: 'BACK',
    label: '回座',
    emoji: '🪑',
    style: ButtonStyle.Success
  }
];


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

const PORT =
  Number(
    process.env.PORT || 10000
  );

http
  .createServer(
    (req, res) => {

      res.writeHead(
        200,
        {
          'Content-Type':
            'text/plain; charset=utf-8'
        }
      );

      res.end(
        '26 Group Attendance V2 online'
      );
    }
  )
  .listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        'HTTP server listening:',
        PORT
      );
    }
  );


/*******************************************************
 * 6. 建立 Discord 打卡面板
 *******************************************************/

function createPanel() {

  const embed =
    new EmbedBuilder()

      .setColor(
        0x38A58A
      )

      .setTitle(
        '📋 26 GROUP｜員工考勤系統'
      )

      .setDescription(

        '請點擊下方按鈕完成打卡。\n\n' +

        '🟢 **上班**：09:00 前完成打卡\n' +

        '🔴 **下班**：結束工作\n\n' +

        '🚻 **上廁所**：限時 15 分鐘\n' +

        '🚬 **抽煙**：限時 7 分鐘\n' +

        '🥡 **外賣**：限時 10 分鐘\n' +

        '🪑 **回座**：結束目前離座\n\n' +

        '⚠️ 超過規定時間將自動通報。\n' +

        '⚠️ 09:00 後上班將記錄為遲到。\n\n' +

        '所有記錄均使用馬來西亞時間。'
      )

      .setFooter({
        text:
          '26 GROUP ATTENDANCE PANEL V2'
      });


  /*
   * Discord 每排最多 5 個按鈕
   *
   * 第一排：
   * 上班 / 下班 / 上廁所 / 抽煙
   *
   * 第二排：
   * 外賣 / 回座
   */

  const row1 =
    new ActionRowBuilder();

  const row2 =
    new ActionRowBuilder();


  for (
    let i = 0;
    i < BUTTONS.length;
    i++
  ) {

    const item =
      BUTTONS[i];

    const button =
      new ButtonBuilder()

        .setCustomId(
          'attendance:' +
          item.id
        )

        .setLabel(
          item.label
        )

        .setEmoji(
          item.emoji
        )

        .setStyle(
          item.style
        );


    if (i < 4) {

      row1.addComponents(
        button
      );

    } else {

      row2.addComponents(
        button
      );
    }
  }


  return {

    embeds: [
      embed
    ],

    components: [
      row1,
      row2
    ]
  };
}


/*******************************************************
 * 7. 根據頻道判斷公司
 *******************************************************/

function getCompany(
  interaction
) {

  const channelId =
    interaction.channelId;


  if (
    channelId ===
    CHANNELS.LV
  ) {

    return 'LV';
  }


  if (
    channelId ===
    CHANNELS.LT
  ) {

    return 'LT';
  }


  if (
    channelId ===
    CHANNELS.MMC
  ) {

    return 'MMC';
  }


  if (
    channelId ===
    CHANNELS.LU
  ) {

    return 'LU';
  }


  throw new Error(
    '這個頻道沒有啟用考勤功能。'
  );
}


/*******************************************************
 * 8. 發送資料到 Apps Script
 *******************************************************/

async function sendAttendance(
  data
) {

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {

        controller.abort();

      },
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

          body:
            JSON.stringify({

              ...data,

              secret:
                API_SECRET
            }),

          redirect:
            'follow',

          signal:
            controller.signal
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


    let result;


    try {

      result =
        JSON.parse(text);

    } catch {

      console.error(
        'Google 回傳非 JSON：',
        text.slice(0, 300)
      );

      throw new Error(
        'Google API 回應格式錯誤'
      );
    }


    return result;

  } finally {

    clearTimeout(
      timeout
    );
  }
}


/*******************************************************
 * 9. 尋找 / 更新四個固定面板
 *******************************************************/

async function setupPanels() {

  for (
    const [
      company,
      channelId
    ]
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


      /*
       * 同時尋找 V1 / V2
       *
       * 這樣不會另外一直建立新面板
       */

      const oldPanel =
        messages.find(
          message => {

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
                    '26 GROUP ATTENDANCE PANEL V2'
                );
              }
            );
          }
        );


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
 * 10. 公開發送遲到通報
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

        .setColor(
          0xE67E22
        )

        .setTitle(
          '⚠️ 員工遲到通報'
        )

        .addFields(

          {
            name: '公司',
            value:
              String(
                result.company
              ),
            inline: true
          },

          {
            name: '員工',
            value:
              '<@' +
              interaction.user.id +
              '>',
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
              String(
                result.time
              ),
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
      embeds: [
        embed
      ]
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
      '發送遲到通報失敗：',
      error.message
    );
  }
}


/*******************************************************
 * 11. 公開發送回座超時結果
 *******************************************************/

async function sendReturnOverdueNotice(
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

        .setColor(
          0xE74C3C
        )

        .setTitle(
          '⚠️ 員工離座超時'
        )

        .addFields(

          {
            name: '公司',
            value:
              String(
                result.company
              ),
            inline: true
          },

          {
            name: '員工',
            value:
              '<@' +
              interaction.user.id +
              '>',
            inline: true
          },

          {
            name: '類型',
            value:
              String(
                result.awayLabel ||
                '離座'
              ),
            inline: true
          },

          {
            name: '規定時間',
            value:
              String(
                result.awayLimit
              ) +
              ' 分鐘',
            inline: true
          },

          {
            name: '實際時間',
            value:
              String(
                result.durationMinutes
              ) +
              ' 分鐘',
            inline: true
          },

          {
            name: '超時',
            value:
              String(
                result.overdueMinutes
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
      embeds: [
        embed
      ]
    });

  } catch (error) {

    console.error(
      '發送回座超時通報失敗：',
      error.message
    );
  }
}


/*******************************************************
 * 12. 自動檢查所有離座超時
 *******************************************************/

let checkingOverdue = false;


async function checkOverdue() {

  /*
   * 防止上一輪還沒完成
   * 下一輪又進來
   */

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
          CHANNELS[
            item.company
          ];


        if (!channelId) {

          console.error(
            '找不到公司頻道：',
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

            .setColor(
              0xE74C3C
            )

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
                name: '員工',
                value:
                  String(
                    item.employee
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


        await channel.send({

          content:
            '<@' +
            item.discordId +
            '>',

          embeds: [
            embed
          ]
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
      error.name ===
        'AbortError'
        ? 'Google API timeout'
        : error.message
    );

  } finally {

    checkingOverdue = false;
  }
}


/*******************************************************
 * 13. Bot 上線
 *******************************************************/

client.once(
  Events.ClientReady,
  async readyClient => {

    console.log(
      '考勤 Bot 已上線：',
      readyClient.user.tag
    );


    await setupPanels();


    /*
     * Bot 上線後先檢查一次
     */

    await checkOverdue();


    /*
     * 每 60 秒檢查一次
     */

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
 * 14. 處理員工按鈕
 *******************************************************/

client.on(
  Events.InteractionCreate,
  async interaction => {

    if (
      !interaction.isButton()
    ) {

      return;
    }


    if (
      !interaction.customId.startsWith(
        'attendance:'
      )
    ) {

      return;
    }


    const action =
      interaction.customId
        .split(':')[1];


    if (
      !BUTTONS.some(
        item =>
          item.id === action
      )
    ) {

      return;
    }


    /*
     * 立即 defer
     * 避免 Discord 顯示
     * 「APP 未能及時回應」
     */

    try {

      await interaction.deferReply({
        flags:
          MessageFlags.Ephemeral
      });

    } catch (error) {

      console.error(
        'Discord 回應失敗：',
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
        interaction.member
          ?.displayName ||

        interaction.user
          .globalName ||

        interaction.user
          .username;


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


      /*************************************************
       * Apps Script 拒絕
       *************************************************/

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


      /*************************************************
       * 重複事件
       *************************************************/

      if (result.duplicate) {

        await interaction.editReply({

          content:
            '⚠️ 這次打卡已經記錄過。'
        });

        return;
      }


      /*************************************************
       * 私人成功訊息
       *************************************************/

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
       * 開始離座時顯示限制
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
       * 回座顯示實際時間
       */

      if (
        action === 'BACK' &&
        result.durationMinutes !== ''
      ) {

        content +=
          '\n離座時間：' +
          result.durationMinutes +
          ' 分鐘';
      }


      await interaction.editReply({
        content:
          content
      });


      /*************************************************
       * 遲到 → 公開通報
       *************************************************/

      if (
        action === 'START' &&
        result.late === true
      ) {

        await sendLateNotice(
          interaction,
          result
        );
      }


      /*************************************************
       * 回座時發現超時
       *
       * Apps Script 自動監控可能已經
       * 通報過，但這裡仍保留結束紀錄。
       *************************************************/

      if (
        action === 'BACK' &&
        result.overdue === true
      ) {

        /*
         * 回座結果只需要私人訊息即可。
         *
         * 超時開始時，
         * checkOverdue 已負責公開通報。
         *
         * 不在這裡再公開一次，
         * 避免同一事件重複刷屏。
         */
      }


      console.log(
        result.company,
        result.employee,
        result.action,
        result.time
      );

    } catch (error) {

      console.error(
        '打卡錯誤：',
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

        .catch(
          console.error
        );
    }
  }
);


/*******************************************************
 * 15. Discord 登入
 *******************************************************/

client.login(TOKEN);
