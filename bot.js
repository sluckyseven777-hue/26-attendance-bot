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
 * 26 GROUP ATTENDANCE BOT V2.4 STABLE
 *
 * LONG-RUN VERSION
 *
 * - /attendance FIRST ACK
 * - Button FIRST ACK
 * - Guild Slash Command
 * - Private attendance panel
 * - Bilingual messages
 * - Gateway reconnect monitoring
 * - Automatic Render restart on confirmed prolonged outage
 * - Apps Script timeout protection
 * - Overdue monitor
 *
 * WORK SCHEDULE IS CONTROLLED BY APPS SCRIPT:
 *
 * LV / LT / MMC = 09:00
 * LU = 13:00
 *
 * Future:
 * XINCHEN / SG / IRL can use separate schedules.
 *******************************************************/


/*******************************************************
 * 1. ENVIRONMENT
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
    '[FATAL] Missing required environment variables'
  );

  process.exit(1);
}


/*******************************************************
 * 2. DISCORD SERVER
 *******************************************************/

const GUILD_ID =
  '1477226931941539973';


/*******************************************************
 * 3. ATTENDANCE CHANNELS
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
 * 4. BUTTONS
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
 * 5. DISCORD CLIENT
 *******************************************************/

const client =
  new Client({

    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]

  });


/*******************************************************
 * 6. RUNTIME STATE
 *******************************************************/

let discordReady =
  false;

let gatewayDownSince =
  null;

let checkingOverdue =
  false;

let shuttingDown =
  false;


/*
 * Discord 已經明確 NOT READY，
 * 並且連續 3 分鐘沒有恢復，
 * 才讓 Render 重啟。
 *
 * 不會因為「沒人打卡」而重啟。
 */

const GATEWAY_FAILURE_LIMIT =
  3 * 60 * 1000;


/*******************************************************
 * 7. HTTP HEALTH SERVER
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
            'V2.4-STABLE',

          http:
            'ONLINE',

          discord:
            client.isReady()
              ? 'READY'
              : 'NOT_READY',

          wsStatus:
            client.ws?.status,

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
 * 8. HELPERS
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
 * 9. ATTENDANCE PANEL
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
          '26 GROUP ATTENDANCE | V2.4'
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
 * 10. APPS SCRIPT API
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
        'Google API response format error'
      );
    }


  } finally {

    clearTimeout(
      timeout
    );

  }
}


/*******************************************************
 * 11. REGISTER /attendance
 *******************************************************/

async function registerCommands() {

  /*****************************************************
   * STEP 1
   * 清除以前残留的 GLOBAL commands
   *****************************************************/

  try {

    const globalCommands =
      await client.application.commands.fetch();

    console.log(
      '[GLOBAL COMMANDS]',
      globalCommands.map(cmd => cmd.name)
    );


    if (globalCommands.size > 0) {

      console.log(
        '[COMMAND CLEANUP] Removing old GLOBAL commands...'
      );


      await client.application.commands.set([]);


      console.log(
        '[COMMAND CLEANUP] GLOBAL commands cleared'
      );

    } else {

      console.log(
        '[COMMAND CLEANUP] No GLOBAL commands found'
      );

    }

  } catch (error) {

    console.error(
      '[COMMAND CLEANUP ERROR]',
      error.message
    );

  }


  /*****************************************************
   * STEP 2
   * 只在 26總群 注册 /attendance
   *****************************************************/

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
    '[COMMAND] /attendance registered ONLY to guild:',
    guild.name,
    '(' + GUILD_ID + ')'
  );
}


/*******************************************************
 * 12. LATE NOTICE
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
      ' min'
    );


  } catch (error) {

    console.error(
      '[LATE ERROR]',
      error.message
    );

  }
}


/*******************************************************
 * 13. OVERDUE CHECK
 *******************************************************/

async function checkOverdue() {

  if (
    checkingOverdue ||
    !client.isReady()
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
          ' min'
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
 * 14. READY
 *******************************************************/

client.once(
  Events.ClientReady,

  async readyClient => {

    discordReady =
      true;

    gatewayDownSince =
      null;


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
 * 15. GATEWAY EVENTS
 *******************************************************/

client.on(
  'shardReady',

  shardId => {

    discordReady =
      true;

    gatewayDownSince =
      null;


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

    gatewayDownSince =
      null;


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


    if (
      gatewayDownSince ===
      null
    ) {

      gatewayDownSince =
        Date.now();

    }


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


    if (
      gatewayDownSince ===
      null
    ) {

      gatewayDownSince =
        Date.now();

    }


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

    console.error(
      '[GATEWAY ERROR]',
      'Shard:',
      shardId,
      error.message
    );

  }
);


/*******************************************************
 * 16. INTERACTIONS
 *******************************************************/

client.on(
  Events.InteractionCreate,

  async interaction => {


    /***************************************************
     * /attendance
     ***************************************************/

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName ===
        'attendance'
    ) {

      console.log(
        '[COMMAND RECEIVED]',
        '/attendance',
        'User:',
        interaction.user.id,
        'Channel:',
        interaction.channelId,
        'Interaction:',
        interaction.id
      );


      /*
       * FIRST ACK
       */

      try {

        await interaction.deferReply({

          flags:
            MessageFlags.Ephemeral

        });


        console.log(
          '[COMMAND ACK]',
          interaction.id
        );


      } catch (error) {

        console.error(
          '[COMMAND ACK FAILED]',
          interaction.id,
          error.message
        );

        return;
      }


      try {

        const company =
          getCompany(
            interaction
          );


        const panel =
          createAttendancePanel(
            company
          );


        await interaction.editReply(
          panel
        );


        console.log(
          '[PANEL OPEN]',
          company,
          interaction.user.id,
          interaction.id
        );


      } catch (error) {

        console.error(
          '[COMMAND ERROR]',
          interaction.id,
          error.message
        );


        await interaction
          .editReply({

            content:

              '❌ **Unable to open attendance panel｜無法開啟考勤面板**\n\n' +
              error.message,

            embeds: [],

            components: []

          })
          .catch(
            () => {}
          );

      }


      return;
    }


    /***************************************************
     * BUTTONS
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
     * BUTTON FIRST ACK
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


      if (
        !result.ok
      ) {

        await interaction.editReply({

          content:

            '⚠️ **Attendance failed｜考勤操作失敗**\n\n' +
            (
              result.message ||
              'Please try again.｜請重新嘗試。'
            )

        });


        return;
      }


      if (
        result.duplicate
      ) {

        await interaction.editReply({

          content:
            '⚠️ This action has already been recorded.｜此操作已經記錄過。'

        });


        return;
      }


      const englishAction =
        BUTTONS[action]?.label ||
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


      if (
        action === 'BACK' &&
        result.durationMinutes !== ''
      ) {

        content +=

          '\nAway Duration｜離座時間: **' +
          result.durationMinutes +
          ' minutes / 分鐘**';


        if (
          result.overdue === true
        ) {

          content +=

            '\nOverdue｜超時: **' +
            result.overdueMinutes +
            ' minutes / 分鐘**';

        }

      }


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
          result.late === true
        ) {

          content +=

            '\nLate｜遲到: **' +
            result.lateMinutes +
            ' minutes / 分鐘**';

        }

      }


      await interaction.editReply({

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
          () => {}
        );

    }

  }
);


/*******************************************************
 * 17. OVERDUE MONITOR
 *******************************************************/

setInterval(

  async () => {

    if (
      client.isReady()
    ) {

      await checkOverdue();

    }

  },

  60 * 1000

);


/*******************************************************
 * 18. GATEWAY WATCHDOG
 *******************************************************/

setInterval(

  () => {

    const ready =
      client.isReady();


    const wsStatus =
      client.ws?.status;


    console.log(
      '[HEARTBEAT]',
      'Discord:',
      ready
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


    /*
     * 正常：
     * 即使一整晚沒有人打卡，也完全不處理。
     */

    if (
      ready
    ) {

      discordReady =
        true;

      gatewayDownSince =
        null;

      return;
    }


    /*
     * Discord 明確 NOT READY
     */

    discordReady =
      false;


    if (
      gatewayDownSince ===
      null
    ) {

      gatewayDownSince =
        Date.now();


      console.error(
        '[WATCHDOG] Discord entered NOT_READY state'
      );

    }


    const downFor =
      Date.now() -
      gatewayDownSince;


    console.error(
      '[WATCHDOG]',
      'Discord unavailable for',
      Math.floor(
        downFor /
        1000
      ),
      'seconds'
    );


    /*
     * 連續 3 分鐘沒有恢復：
     * 退出 Node。
     *
     * Render 會依照服務設定重新啟動 process。
     */

    if (
      downFor >=
      GATEWAY_FAILURE_LIMIT
    ) {

      console.error(
        '[WATCHDOG RESTART] Discord Gateway did not recover'
      );


      gracefulRestart(
        'Discord Gateway recovery timeout'
      );

    }

  },

  30 * 1000

);


/*******************************************************
 * 19. DISCORD ERROR
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
 * 20. NODE ERRORS
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
 * 21. GRACEFUL RESTART
 *******************************************************/

function gracefulRestart(
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


  /*
   * 非 0 exit：
   * 讓 Render 判斷 process 已失敗，
   * 再依服務策略重新啟動。
   */

  setTimeout(
    () => {

      process.exit(1);

    },
    1500
  );

}


/*******************************************************
 * 22. LOGIN
 *******************************************************/

console.log(
  '[BOOT] 26 GROUP ATTENDANCE V2.4 STABLE'
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
