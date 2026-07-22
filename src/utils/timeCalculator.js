/**
 * timeCalculator.js
 * Utility to calculate task due dates based strictly on office working hours.
 * Office hours: Monday to Friday, 9:00 AM to 7:00 PM.
 */

const OFFICE_START_HOUR = 9;
const OFFICE_END_HOUR = 19;

/**
 * Checks if a given date is a weekend (Saturday or Sunday)
 */
const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * Moves a date to the next valid working day at 9:00 AM
 */
const moveToNextWorkingDay = (date) => {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + 1);
  newDate.setHours(OFFICE_START_HOUR, 0, 0, 0);

  // If the next day is a weekend, skip to Monday
  while (isWeekend(newDate)) {
    newDate.setDate(newDate.getDate() + 1);
  }
  return newDate;
};

/**
 * Adjusts the starting date to fall within valid working hours.
 */
const adjustToWorkingHours = (startDate) => {
  let date = new Date(startDate);

  // If weekend, move to next Monday 9 AM
  if (isWeekend(date)) {
    date = moveToNextWorkingDay(date);
    // If we moved from Saturday, we just need to ensure it's Monday 9 AM.
    // The while loop inside moveToNextWorkingDay handled this.
    // However, if the original date was Sunday, it moved to Monday.
    // Let's reset hours to 9 AM just in case.
    date.setHours(OFFICE_START_HOUR, 0, 0, 0);
    return date;
  }

  // If weekday but before 9 AM, move to 9 AM today
  if (date.getHours() < OFFICE_START_HOUR) {
    date.setHours(OFFICE_START_HOUR, 0, 0, 0);
    return date;
  }

  // If weekday but after 7 PM, move to 9 AM next working day
  if (date.getHours() >= OFFICE_END_HOUR) {
    return moveToNextWorkingDay(date);
  }

  return date;
};

/**
 * Calculates the exact due date for a task based on start date and estimated hours.
 * @param {string|Date} startDate - The intended start date
 * @param {number} durationHours - Estimated duration in hours
 * @returns {Date} The calculated due date
 */
const calculateTaskDueDate = (startDate, durationHours) => {
  if (!startDate || !durationHours || durationHours <= 0) {
    return new Date(startDate);
  }

  let currentDate = adjustToWorkingHours(startDate);
  let remainingHours = Number(durationHours);

  while (remainingHours > 0) {
    // Calculate how many hours are left in the current working day
    // Current time could be e.g. 15:30 (3:30 PM), end time is 19:00 (7:00 PM)
    const endOfDay = new Date(currentDate);
    endOfDay.setHours(OFFICE_END_HOUR, 0, 0, 0);
    
    // Remaining time today in hours
    const hoursLeftToday = (endOfDay.getTime() - currentDate.getTime()) / (1000 * 60 * 60);

    if (remainingHours <= hoursLeftToday) {
      // The task finishes today
      currentDate.setTime(currentDate.getTime() + remainingHours * 60 * 60 * 1000);
      remainingHours = 0;
    } else {
      // The task spans to the next working day
      remainingHours -= hoursLeftToday;
      currentDate = moveToNextWorkingDay(currentDate);
    }
  }

  return currentDate;
};

module.exports = {
  calculateTaskDueDate,
  adjustToWorkingHours
};
