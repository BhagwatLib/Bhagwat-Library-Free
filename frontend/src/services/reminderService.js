import { BACKEND_URL } from '../config/backend';

/**
 * Fetch reminder configuration & scheduler status
 */
export const getReminderSettings = async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/reminders/settings`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const json = await res.json();
    return json.data || {};
  } catch (err) {
    console.error('Failed to fetch reminder settings:', err);
    return {
      whatsappEnabled: true,
      automatedScheduler: true,
      enabled: true,
      reminderTime: '14:30',
      libraryName: 'Bhagwat Library',
      scheduler: { enabled: true, reminderTime: '14:30' },
    };
  }
};


/**
 * Save reminder configuration
 */
export const saveReminderSettings = async (settings) => {
  const res = await fetch(`${BACKEND_URL}/api/reminders/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to save reminder settings');
  }
  return data.data;
};

/**
 * Trigger immediate reminder scan
 */
export const triggerReminderScan = async (extraItems = null) => {
  const res = await fetch(`${BACKEND_URL}/api/reminders/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraItems }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to trigger reminder scan');
  }
  return data;
};

/**
 * Fetch reminder logs
 */
export const getReminderLogs = async (params = {}) => {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${BACKEND_URL}/api/reminders/logs?${query}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.error('Failed to fetch reminder logs:', err);
    return [];
  }
};

/**
 * Fetch issued books
 */
export const getIssuedBooks = async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/reminders/books`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.error('Failed to fetch issued books:', err);
    return [];
  }
};

/**
 * Add issued book record
 */
export const addIssuedBook = async (bookData) => {
  const res = await fetch(`${BACKEND_URL}/api/reminders/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookData),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to add issued book');
  }
  return data.data;
};

/**
 * Update issued book record
 */
export const updateIssuedBook = async (id, updateData) => {
  const res = await fetch(`${BACKEND_URL}/api/reminders/books/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update issued book');
  }
  return data.data;
};
