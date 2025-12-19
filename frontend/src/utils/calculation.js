/**
 * Calculates the arithmetic mean of stock change rates.
 * @param {Array} stocks - Array of stock objects { name, rate }
 * @returns {string} - The calculated score formatted to 2 decimal places.
 */
export const calculateThemeScore = (stocks) => {
  if (!stocks || stocks.length === 0) return "0.00";
  
  // Calculate sum of rates
  const sum = stocks.reduce((acc, stock) => acc + stock.rate, 0);
  
  // Calculate average
  const average = sum / stocks.length;
  
  // Return formatted string
  return average.toFixed(2);
};
