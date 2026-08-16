// Generates a 384-dimensional normalized vector embedding locally
export const generateVector = (text, dimensions = 384) => {
  const vector = new Array(dimensions).fill(0);
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = (hash << 5) - hash + word.charCodeAt(j);
      hash |= 0;
    }
    
    const index = Math.abs(hash) % dimensions;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 / Math.sqrt(words.length));
  }
  
  // Normalize vector (L2 norm)
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vector.map(val => Number((val / magnitude).toFixed(6)));
};

export default generateVector;
