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
 * 26 GROUP ATTENDANCE BOT V2.3.1 STABLE
 *
 * /attendance 私人考勤面板
 *
 * 班次時間由 Apps Script 控制：
 * LV / LT / MMC = 09:00
 * LU = 13:00
 *
 * 未來鑫晨可設定另一個時間。
 *
 * 離座：
 * Toilet = 15 min
 * Smoke = 7 min
 * Take Away = 10 min
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
 * 2. Discord Server
 *******************************************************/

const GUILD_ID =
  '1477226931941539973';


/*******************************************************
 * 3. Attendance Channels
 *******************************************************/

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
 * 4. Buttons
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
 * 5. Client
 *******************************************************/

const client =
  new Client({

    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]

  });


/*******************************************************
 * 6. Runtime State
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


const GATEWAY_RECOVERY_TIMEOUT =
  3 * 60 * 1000;


/*******************************************************
 * 7. HTTP Server
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
            'V2.3.1-STABLE',

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
 * 8. Helpers
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
    interaction.member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username
  );
}


function getCompany(
  interaction
) {

  const channelId =
    interaction.channelId;


  for (
    const [company, id]
    of Object.entries(CHANNELS)
  ) {

    if (
      channelId === id
    ) {

      return company;
    }
  }


  throw new Error(
    'Attendance is not enabled in this channel.｜此頻道未啟用考勤。'
  );
}


/*******************************************************
 * 9. Attendance Panel
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

        '**Company｜公司：' +
        company +
        '**\n\n' +

        '**WORK｜上下班**\n' +
        '🟢 Start Work｜上班\n' +
        '🔴 Off Work｜下班\n' +
        '🪑 Back to Seat｜回座\n\n' +

        '**AWAY｜離座**\n' +
        '🚻 Toilet｜上廁所 — 15 minutes / 分鐘\n' +
        '🚬 Smoke｜抽煙 — 7 minutes / 分鐘\n' +
        '🥡 Take Away｜外賣 — 10 minutes / 分鐘\n\n' +

        '⚠️ Late clock-in will be recorded automatically.\n' +
        '遲到將自動記錄並公開通報。\n\n' +

        '⚠️ Away overtime will be reported automatically.\n' +
        '離座超時將自動公開通報。\n\n' +

        '🕒 Malaysia Time｜馬來西亞時間'

      )

      .setFooter({
        text:
          '26 GROUP ATTENDANCE | V2.3.1'
      });


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
 * 10. Apps Script API
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
 * 11. Register /attendance
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
     * 由 Apps Script 回傳各公司的班次。
     *
     * LV/LT/MMC = 09:00
     * LU = 13:00
     * 鑫晨未來可使用另一時間。
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
          '⚠️ Late Attendance Notice｜員工遲到通報'
        )

        .setDescription(

          '<@' +
          interaction.user.id +
          '> clocked in late.\n' +

          '<@' +
          interaction.user.id +
          '> 上班打卡遲到。'

        )

        .addFields(

          {
            name:
              'Company｜公司',

            value:
              String(
                result.company
              ),

            inline:
              true
          },

          {
            name:
              'Scheduled Start｜規定時間',

            value:
              workStart,

            inline:
              true
          },

          {
            name:
              'Clock-in Time｜實際打卡',

            value:
              String(
                result.time
              ),

            inline:
              true
          },

          {
            name:
              'Late｜遲到',

            value:
              String(
                result.lateMinutes
              ) +
              ' minutes / 分鐘',

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
              '🚨 Away Overtime Notice｜離座超時通報'
            )

            .setDescription(

              '<@' +
              item.discordId +
              '> exceeded the allowed away time.\n' +

              '<@' +
              item.discordId +
              '> 已超過規定離座時間。'

            )

            .addFields(

              {
                name:
                  'Company｜公司',

                value:
                  String(
                    item.company
                  ),

                inline:
                  true
              },

              {
                name:
                  'Type｜類型',

                value:
                  String(
                    item.awayLabel
                  ),

                inline:
                  true
              },

              {
                name:
                  'Start Time｜開始時間',

                value:
                  String(
                    item.startTime
                  ),

                inline:
                  true
              },

              {
                name:
                  'Time Limit｜規定時間',

                value:
                  String(
                    item.limitMinutes
                  ) +
                  ' minutes / 分鐘',

                inline:
                  true
              },

              {
                name:
                  'Away Duration｜目前已離座',

                value:
                  String(
                    item.elapsedMinutes
                  ) +
                  ' minutes / 分鐘',

                inline:
                  true
              },

              {
                name:
                  'Overdue｜目前超時',

                value:
                  String(
                    item.overdueMinutes
                  ) +
                  ' minutes / 分鐘',

                inline:
                  true
              }

            )

            .setFooter({
              text:
                '26 GROUP ATTENDANCE | AUTO MONITOR'
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


    try {

      await registerCommands();

    } catch (error) {

      console.error(
        '[COMMAND ERROR]',
        error.message
      );

    }


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
 *******************************************************/

client.on(
  Events.InteractionCreate,

  async interaction => {

    lastGatewayActivity =
      Date.now();


    /***************************************************
     * /attendance
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
            .catch(
              () => {}
            );


        } else {

          await interaction
            .reply({

              content:
                '❌ ' +
                error.message,

              flags:
                MessageFlags.Ephemeral

            })
            .catch(
              () => {}
            );

        }

      }


      return;
    }


    /***************************************************
     * Attendance Buttons
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


    /***************************************************
     * ACK FIRST
     ***************************************************/

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
       * API Failure
       *************************************************/

      if (
        !result.ok
      ) {

        await interaction
          .editReply({

            content:

              '⚠️ **Attendance failed｜考勤操作失敗**\n\n' +
              (
                result.message ||
                'Please try again.｜請重新嘗試。'
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
              '⚠️ This action has already been recorded.｜此操作已經記錄過。'

          });


        return;
      }


      /*************************************************
       * Success
       *************************************************/

      const englishAction =
        BUTTONS[action]
          ?.label ||
        action;


      let content =

        '✅ **' +
        englishAction +
        '｜' +
        result.action +
        ' recorded successfully｜記錄成功**\n\n' +

        'Company｜公司: **' +
        result.company +
        '**\n' +

        'Employee｜員工: **' +
        result.employee +
        '**\n' +

        'Time｜時間: **' +
        result.date +
        ' ' +
        result.time +
        '**';


      /*************************************************
       * Away Start
       *************************************************/

      if (
        action === 'TOILET' ||
        action === 'SMOKE' ||
        action === 'TAKEAWAY'
      ) {

        content +=

          '\nTime Limit｜規定時間: **' +
          result.awayLimit +
          ' minutes / 分鐘**';

      }


      /*************************************************
       * Back
       *************************************************/

      if (
        action === 'BACK' &&
        result.durationMinutes !== ''
      ) {

        content +=

          '\nAway Duration｜離座時間: **' +
          result.durationMinutes +
          ' minutes / 分鐘**';


        if (
          result.overdue ===
          true
        ) {

          content +=

            '\nOverdue｜超時: **' +
            result.overdueMinutes +
            ' minutes / 分鐘**';

        }

      }


      /*************************************************
       * Start Work
       *************************************************/

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

          '\nScheduled Start｜規定時間: **' +
          workStart +
          '**';


        if (
          result.late ===
          true
        ) {

          content +=

            '\nLate｜遲到: **' +
            result.lateMinutes +
            ' minutes / 分鐘**';

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
       * Public Late Notice
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

            '❌ **System Error｜系統錯誤**\n\n' +

            (
              error.name ===
                'AbortError'

                ? 'Connection timeout. Please contact an administrator to confirm the record.｜連線逾時，請聯絡管理員確認記錄。'

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
  '[BOOT] 26 GROUP ATTENDANCE V2.3.1 STABLE'
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
