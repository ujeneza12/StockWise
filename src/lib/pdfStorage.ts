// This file has been removed as PDF storage functionality is no longer used
// All PDF operations are now handled client-side in the DailyReports component

export const generateAndStoreDailyReportPDF = () => {
  throw new Error('PDF storage functionality has been removed. Use client-side PDF export instead.');
};

export const getStoredPDFReports = () => {
  return Promise.resolve([]);
};

export const getPDFDownloadURL = () => {
  return Promise.resolve(null);
};

export const deleteStoredPDF = () => {
  return Promise.resolve(false);
};

export const convertPDFToTableData = () => {
  return Promise.resolve(null);
};