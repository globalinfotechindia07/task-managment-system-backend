const cron = require('node-cron');
const StickyNote = require('../models/StickyNote');
const { dispatchNoteReminder } = require('../controllers/stickyNoteController');

const initStickyNoteReminderJob = () => {
  // Check every minute for due sticky note reminders
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      const dueNotes = await StickyNote.find({
        reminderAt: { $lte: now },
        reminderSent: false,
        isCompleted: false,
        isArchived: false,
      })
        .populate('user', 'name email company')
        .populate('company', 'name');

      if (dueNotes.length > 0) {
        console.log(`[StickyNoteCron] Processing ${dueNotes.length} due reminder(s) at ${now.toISOString()}...`);

        for (const note of dueNotes) {
          if (note.user) {
            try {
              await dispatchNoteReminder(note, note.user, note.company);
              note.reminderSent = true;
              await note.save();
              console.log(
                `[StickyNoteCron] Successfully sent reminder for note "${note.title || note._id}" to user ${note.user.email}`
              );
            } catch (itemErr) {
              console.error(`[StickyNoteCron] Error processing note ${note._id}:`, itemErr.message);
            }
          } else {
            // Note has no valid user reference, mark sent to prevent infinite loop
            note.reminderSent = true;
            await note.save();
          }
        }
      }
    } catch (error) {
      console.error('[StickyNoteCron] Error during scheduled reminder scan:', error.message);
    }
  });

  console.log('Sticky Note Reminder Cron Job initialized (runs every 60s)');
};

module.exports = initStickyNoteReminderJob;
