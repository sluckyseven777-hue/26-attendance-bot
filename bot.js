const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder
} = require('discord.js');

const http = require('node:http');


/*******************************************************
 * 26 GROUP ATTENDANCE BOT V2.3 STABLE
 *
 * /attendance 私人考勤面板
 *
 * 班次時間由 Apps Script 控制：
 * LV  = 09:00
 * LT  = 09:00
 * MMC = 09:00
 * LU  = 13:00
 *
 * 未來可直接增加：
 * XINCHEN / SG / IRL 等不同班次
 *
 * 離座限制：
 * Toilet    = 15 min
 * Smoke     = 7 min
 * Take Away = 10 min
 *
 * 保留 V2.2 STABLE：
 * - Discord Gateway 狀態監控
 * - Gateway 斷線自動恢復
 * - 長時間失聯交給 Render 重啟
 * - Interaction 詳細診斷
 * - Apps Script timeout
 * - 超時監控防重疊
 *******************************************************/


/*******************************************************
 * 1. Environment
 *******************************************************/

const TOKEN =
  process.env.TOKEN;

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL;

const API_SECRET =
  process.env.API_SECRET;


if (
  !TOKEN ||
  !APPS_SCRIPT_URL ||
  !API_SECRET
) {

  console.error(
    '[FATAL] 缺少必要的 Render 環境變數'
  );

  process.exit(1);
}


/*******************************************************
 * 2. Attendance Channels
 *
 * 未來鑫晨加入：
 *
 * 例如：
 * XINCHEN: 'CHANNEL_ID'
 *
 * Apps Script 再設定對應班次即可。
 *******************************************************/
const GUILD_ID = '1477226931941539973';

const CHANNELS = {

  LV:
    '1536948264954236998',

  LT:
    '1554087224973197323',

  MMC:
    '1554087319450030140',

  LU:
    '1554087992279433266'

};


/*******************************************************
 * 3. Buttons
 *******************************************************/

const BUTTONS = {

  START: {
    id: 'START',
    label: 'Start Work',
    emoji: '🟢',
    style: ButtonStyle.Success
  },

  OFF: {
    id: 'OFF',
    label: 'Off Work',
    emoji: '🔴',
    style: ButtonStyle.Danger
  },

  BACK: {
    id: 'BACK',
    label: 'Back to Seat',
    emoji: '🪑',
    style: ButtonStyle.Success
  },

  TOILET: {
    id: 'TOILET',
    label: 'Toilet',
    emoji: '🚻',
    style: ButtonStyle.Primary
  },

  SMOKE: {
    id: 'SMOKE',
    label: 'Smoke',
    emoji: '🚬',
    style: ButtonStyle.Secondary
  },

  TAKEAWAY: {
    id: 'TAKEAWAY',
    label: 'Take Away',
    emoji: '🥡',
    style: ButtonStyle.Primary
  }

};


/*******************************************************
 * 4. Client
 *******************************************************/

const client =
  new Client({

    intents: [

      GatewayIntentBits.Guilds,

      GatewayIntentBits.GuildMembers

    ]

  });


/*******************************************************
 * 5. Runtime State
 *******************************************************/

let discordReady =
  false;

let lastReadyAt =
  0;

let lastGatewayActivity =
  Date.now();

let checkingOverdue =
  false;

let shuttingDown =
  false;


/*
 * Discord Gateway 斷線後，
 * 超過 3 分鐘仍未恢復：
 *
 * 主動退出 Node，
 * 交給 Render 重啟。
 */

const GATEWAY_RECOVERY_TIMEOUT =
  3 * 60 * 1000;


/*******************************************************
 * 6. HTTP Server
 *******************************************************/

const PORT =
  Number(
    process.env.PORT ||
    10000
  );


http
  .createServer(
    (req, res) => {

      const body =
        JSON.stringify({

          service:
            '26 Group Attendance',

          version:
            'V2.3-STABLE',

          http:
            'ONLINE',

          discord:
            discordReady
              ? 'READY'
              : 'NOT_READY',

          uptimeSeconds:
            Math.floor(
              process.uptime()
            )

        });


      res.writeHead(
        200,
        {
          'Content-Type':
            'application/json; charset=utf-8'
        }
      );


      res.end(body);

    }
  )
  .listen(
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
}


function getEmployeeName(
  interaction
) {

  return (

    interaction.member
      ?.displayName ||

    interaction.user
      .globalName ||

    interaction.user
      .username

  );
}


/*
 * 根據員工使用 /attendance
 * 的頻道判斷公司。
 *
 * 員工不需要自己選公司。
 */

function getCompany(
  interaction
) {

  const channelId =
    interaction.channelId;


  for (
    const [
      company,
      id
    ]
    of Object.entries(CHANNELS)
  ) {

    if (
      channelId === id
    ) {

      return company;
    }
  }


  throw new Error(
    'Attendance is not enabled in this channel.'
  );
}


/*******************************************************
 * 8. /attendance Panel
 *******************************************************/

function createAttendancePanel(
  company
) {

  const embed =
    new EmbedBuilder()

      .setColor(
        0x38A58A
      )

      .setTitle(
        '📋 26 GROUP | ATTENDANCE'
      )

      .setDescription(

        '**Company: ' +
        company +
        '**\n\n' +

        '**WORK**\n' +
        '🟢 Start Work\n' +
        '🔴 Off Work\n' +
        '🪑 Back to Seat\n\n' +

        '**AWAY**\n' +
        '🚻 Toilet — 15 minutes\n' +
        '🚬 Smoke — 7 minutes\n' +
        '🥡 Take Away — 10 minutes\n\n' +

        '⚠️ Late clock-in will be recorded automatically.\n' +
        '⚠️ Away overtime will be reported automatically.\n\n' +

        '🕒 Malaysia Time'

      )

      .setFooter({
        text:
          '26 GROUP ATTENDANCE | V2.3'
      });


  /*
   * 第一排
   *
   * Start Work
   * Off Work
   * Back to Seat
   */

  const row1 =
    new ActionRowBuilder()

      .addComponents(

        makeButton(
          BUTTONS.START
        ),

        makeButton(
          BUTTONS.OFF
        ),

        makeButton(
          BUTTONS.BACK
        )

      );


  /*
   * 第二排
   *
   * Toilet
   * Smoke
   * Take Away
   */

  const row2 =
    new ActionRowBuilder()

      .addComponents(

        makeButton(
          BUTTONS.TOILET
        ),

        makeButton(
          BUTTONS.SMOKE
        ),

        makeButton(
          BUTTONS.TAKEAWAY
        )

      );


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
 * 9. Apps Script API
 *******************************************************/

async function sendAttendance(
  data
) {

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      25000
    );


  try {

    const response =
      await fetch(
        APPS_SCRIPT_URL,
        {

          method:
            'POST',

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


    if (
      !response.ok
    ) {

      throw new Error(
        'Google API HTTP ' +
        response.status
      );
    }


    const text =
      await response.text();


    try {

      return JSON.parse(
        text
      );

    } catch {

      console.error(
        '[API NON JSON]',
        text.slice(
          0,
          300
        )
      );


      throw new Error(
        'Google API 回應格式錯誤'
      );

    }

  } finally {

    clearTimeout(
      timeout
    );

  }
}


/*******************************************************
 * 10. Register /attendance
 *******************************************************/

async function registerCommands() {

  const guild =
    await client.guilds.fetch(
      GUILD_ID
    );

  const command =
    new SlashCommandBuilder()

      .setName(
        'attendance'
      )

      .setDescription(
        'Open the employee attendance panel'
      );


  await guild.commands.set([
    command.toJSON()
  ]);


  console.log(
    '[COMMAND] /attendance registered to guild:',
    guild.name,
    '(' + GUILD_ID + ')'
  );
}


/*******************************************************
 * 11. Remove Old Fixed Panels
 *
 * V2.3 不再使用固定考勤面板。
 *
 * 啟動時會尋找舊 V1 / V2 / V2.1 / V2.2
 * 考勤面板並刪除。
 *
 * 遲到 / 超時通報不會刪除。
 *******************************************************/

async function removeOldPanels() {

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

        continue;
      }


      const messages =
        await channel.messages.fetch({
          limit: 100
        });


      const oldPanels =
        messages.filter(
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
                  embed.footer
                    ?.text ||
                  '';


                const title =
                  embed.title ||
                  '';


                return (

                  footer ===
                    '26 GROUP ATTENDANCE PANEL V1' ||

                  footer ===
                    '26 GROUP ATTENDANCE PANEL V2' ||

                  footer ===
                    '26 GROUP ATTENDANCE｜V2.1' ||

                  footer ===
                    '26 GROUP ATTENDANCE｜V2.2' ||

                  title ===
                    '📋 26 GROUP｜員工考勤'

                );

              }
            );

          }
        );


      if (
        oldPanels.size === 0
      ) {

        console.log(
          '[OLD PANEL]',
          company,
          '沒有舊面板'
        );

        continue;
      }


      for (
        const message
        of oldPanels.values()
      ) {

        await message
          .delete()
          .catch(
            error => {

              console.error(
                '[OLD PANEL DELETE ERROR]',
                company,
                error.message
              );

            }
          );

      }


      console.log(
        '[OLD PANEL]',
        company,
        '舊面板已清除'
      );


    } catch (error) {

      console.error(
        '[OLD PANEL ERROR]',
        company,
        error.message
      );

    }

  }

}


/*******************************************************
 * 12. Late Notice
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


    /*
     * 不再寫死 09:00。
     *
     * Apps Script 回傳：
     *
     * LV/LT/MMC -> 09:00
     * LU        -> 13:00
     *
     * 未來鑫晨也是讀 Apps Script。
     */

    const workStart =
      result.workStartDisplay ||
      (
        result.workStart
          ? String(
              result.workStart
            ).substring(
              0,
              5
            )
          : '--:--'
      );


    const embed =
      new EmbedBuilder()

        .setColor(
          0xE67E22
        )

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
            name:
              '公司',

            value:
              String(
                result.company
              ),

            inline:
              true
          },

          {
            name:
              '規定時間',

            value:
              workStart,

            inline:
              true
          },

          {
            name:
              '實際打卡',

            value:
              String(
                result.time
              ),

            inline:
              true
          },

          {
            name:
              '遲到時間',

            value:
              String(
                result.lateMinutes
              ) +
              ' 分鐘',

            inline:
              true
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
      '[LATE]',
      result.company,
      result.employee,
      'Schedule:',
      workStart,
      'Late:',
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
 * 13. Overdue Check
 *******************************************************/

async function checkOverdue() {

  if (
    checkingOverdue ||
    !discordReady
  ) {

    return;
  }


  checkingOverdue =
    true;


  try {

    const result =
      await sendAttendance({

        operation:
          'CHECK_OVERDUE'

      });


    if (
      !result.ok
    ) {

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
          CHANNELS[
            item.company
          ];


        if (
          !channelId
        ) {

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
                name:
                  '公司',

                value:
                  String(
                    item.company
                  ),

                inline:
                  true
              },

              {
                name:
                  '類型',

                value:
                  String(
                    item.awayLabel
                  ),

                inline:
                  true
              },

              {
                name:
                  '開始時間',

                value:
                  String(
                    item.startTime
                  ),

                inline:
                  true
              },

              {
                name:
                  '規定時間',

                value:
                  String(
                    item.limitMinutes
                  ) +
                  ' 分鐘',

                inline:
                  true
              },

              {
                name:
                  '目前已離座',

                value:
                  String(
                    item.elapsedMinutes
                  ) +
                  ' 分鐘',

                inline:
                  true
              },

              {
                name:
                  '目前超時',

                value:
                  String(
                    item.overdueMinutes
                  ) +
                  ' 分鐘',

                inline:
                  true
              }

            )

            .setFooter({
              text:
                '26 GROUP ATTENDANCE｜自動超時監控'
            });


        await channel.send({
          embeds: [
            embed
          ]
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

      error.name ===
        'AbortError'

        ? 'Google API timeout'

        : error.message
    );


  } finally {

    checkingOverdue =
      false;

  }

}


/*******************************************************
 * 14. Discord Ready
 *******************************************************/

client.once(
  Events.ClientReady,

  async readyClient => {

    discordReady =
      true;

    lastReadyAt =
      Date.now();

    lastGatewayActivity =
      Date.now();


    console.log(
      '[GATEWAY READY]',
      readyClient.user.tag
    );


    /*
     * 註冊 /attendance
     */

    try {

      await registerCommands();

    } catch (error) {

      console.error(
        '[COMMAND ERROR]',
        error.message
      );

    }


    /*
     * 清掉舊固定面板
     */

    await removeOldPanels();


    /*
     * 啟動後立即檢查一次超時
     */

    await checkOverdue();


    console.log(
      '[MONITOR] 離座超時監控啟動'
    );

  }
);


/*******************************************************
 * 15. Gateway Monitoring
 *******************************************************/

client.on(
  'shardReady',

  shardId => {

    discordReady =
      true;

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

    discordReady =
      true;

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

    discordReady =
      false;

    lastGatewayActivity =
      Date.now();


    console.error(
      '[GATEWAY DISCONNECT]',
      'Shard:',
      shardId,
      'Code:',
      event?.code,
      'Reason:',
      event?.reason ||
      ''
    );

  }
);


client.on(
  'shardReconnecting',

  shardId => {

    discordReady =
      false;

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
 * 16. Interaction
 *
 * 同時處理：
 *
 * A. /attendance
 * B. attendance 按鈕
 *******************************************************/

client.on(
  Events.InteractionCreate,

  async interaction => {

    lastGatewayActivity =
      Date.now();


    /***************************************************
     * A. /attendance
     ***************************************************/

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName ===
        'attendance'
    ) {

      console.log(
        '[COMMAND]',
        '/attendance',
        'User:',
        interaction.user.id,
        'Channel:',
        interaction.channelId
      );


      try {

        const company =
          getCompany(
            interaction
          );


        await interaction.reply({

          ...createAttendancePanel(
            company
          ),

          flags:
            MessageFlags.Ephemeral

        });


        console.log(
          '[PANEL OPEN]',
          company,
          interaction.user.id
        );


      } catch (error) {

        console.error(
          '[COMMAND ERROR]',
          error.message
        );


        if (
          interaction.replied ||
          interaction.deferred
        ) {

          await interaction
            .editReply({
              content:
                '❌ ' +
                error.message
            })
            .catch(() => {});


        } else {

          await interaction
            .reply({

              content:
                '❌ ' +
                error.message,

              flags:
                MessageFlags.Ephemeral

            })
            .catch(() => {});

        }

      }


      return;
    }


    /***************************************************
     * B. Attendance Button
     ***************************************************/

    if (
      !interaction.isButton()
    ) {

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


    if (
      !BUTTONS[action]
    ) {

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
     *
     * 一定先 ACK，
     * 避免「APP 未能及時回應」。
     */

    try {

      await interaction
        .deferReply({

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

          ok:
            result.ok,

          code:
            result.code,

          message:
            result.message,

          workStart:
            result.workStart

        })
      );


      /*************************************************
       * API Error
       *************************************************/

      if (
        !result.ok
      ) {

        await interaction
          .editReply({

            content:

              '⚠️ ' +
              (
                result.message ||
                'Attendance failed.'
              )

          });


        return;
      }


      /*************************************************
       * Duplicate
       *************************************************/

      if (
        result.duplicate
      ) {

        await interaction
          .editReply({

            content:
              '⚠️ This attendance action has already been recorded.'

          });


        return;
      }


      /*************************************************
       * Success Message
       *************************************************/

      let englishAction =
        BUTTONS[action]
          ?.label ||
        action;


      let content =

        '✅ **' +
        englishAction +
        ' recorded successfully.**\n\n' +

        'Company: **' +
        result.company +
        '**\n' +

        'Employee: **' +
        result.employee +
        '**\n' +

        'Time: **' +
        result.date +
        ' ' +
        result.time +
        '**';


      /*
       * 離座開始
       */

      if (
        action === 'TOILET' ||
        action === 'SMOKE' ||
        action === 'TAKEAWAY'
      ) {

        content +=

          '\nLimit: **' +
          result.awayLimit +
          ' minutes**';

      }


      /*
       * 回座
       */

      if (
        action === 'BACK' &&
        result.durationMinutes !== ''
      ) {

        content +=

          '\nAway Duration: **' +
          result.durationMinutes +
          ' minutes**';


        if (
          result.overdue ===
          true
        ) {

          content +=

            '\nOverdue: **' +
            result.overdueMinutes +
            ' minutes**';

        }

      }


      /*
       * 上班時顯示班次
       */

      if (
        action === 'START' &&
        result.workStart
      ) {

        const workStart =
          result.workStartDisplay ||
          String(
            result.workStart
          ).substring(
            0,
            5
          );


        content +=

          '\nScheduled Start: **' +
          workStart +
          '**';


        if (
          result.late === true
        ) {

          content +=

            '\nLate: **' +
            result.lateMinutes +
            ' minutes**';

        }

      }


      await interaction
        .editReply({

          content:
            content

        });


      console.log(
        '[DONE]',
        interaction.id,
        result.company,
        result.employee,
        result.action,
        result.time
      );


      /*************************************************
       * Late Public Notice
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

                ? 'Connection timeout. Please contact an administrator to confirm the record.'

                : error.message
            )

        })
        .catch(
          error2 => {

            console.error(
              '[EDIT REPLY FAILED]',
              interaction.id,
              error2.message
            );

          }
        );

    }

  }
);


/*******************************************************
 * 17. 每分鐘檢查離座超時
 *******************************************************/

setInterval(

  async () => {

    if (
      discordReady
    ) {

      await checkOverdue();

    }

  },

  60 * 1000

);


/*******************************************************
 * 18. Gateway Watchdog
 *
 * 每 30 秒檢查 Discord Client。
 *
 * 3 分鐘沒有恢復：
 * 退出 Node → Render Restart
 *******************************************************/

setInterval(

  () => {

    const now =
      Date.now();


    const wsStatus =
      client.ws
        ?.status;


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
      ) +
      's'
    );


    if (
      isReady
    ) {

      discordReady =
        true;

      lastGatewayActivity =
        now;

      return;
    }


    discordReady =
      false;


    const downFor =
      now -
      lastGatewayActivity;


    console.error(
      '[GATEWAY NOT READY]',
      'Down:',
      Math.floor(
        downFor /
        1000
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
 * 19. Discord Client Error
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
 * 20. Node Error
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
 * 21. Graceful Restart
 *******************************************************/

async function gracefulRestart(
  reason
) {

  if (
    shuttingDown
  ) {

    return;
  }


  shuttingDown =
    true;


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
 * 22. Login
 *******************************************************/

console.log(
  '[BOOT] 26 GROUP ATTENDANCE V2.3 STABLE'
);


client
  .login(
    TOKEN
  )
  .catch(
    error => {

      console.error(
        '[LOGIN FAILED]',
        error
      );

      process.exit(1);

    }
  );
