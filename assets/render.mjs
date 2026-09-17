import sharp from 'sharp';
await sharp('assets/icon.svg', { density: 512 }).resize(1024, 1024).png().toFile('assets/icon.png');
await sharp('assets/splash.svg', { density: 220 }).resize(2732, 2732).png().toFile('assets/splash.png');
console.log('PNG générés : icon.png (1024), splash.png (2732)');
