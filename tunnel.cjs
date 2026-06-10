const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("🚀 Starting tunnel to your local backend...");
console.log("   (This uses localhost.run, completely free and safe)");

// Start the SSH tunnel
const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-R', '80:127.0.0.1:3001',
    'nokey@localhost.run'
]);

let urlFound = false;

ssh.stdout.on('data', (data) => {
    const output = data.toString();
    console.log("[SSH OUTPUT]:", output);
    
    // Look for the URL in the output
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/);
    if (match && !urlFound) {
        urlFound = true;
        const url = match[0];
        console.log(`\n✅ Tunnel created successfully!`);
        console.log(`🔗 Your temporary backend URL is: ${url}`);
        
        // Update .env.production
        const envPath = path.join(__dirname, '.env.production');
        fs.writeFileSync(envPath, `VITE_API_URL=${url}/api\n`);
        console.log(`\n📝 Updated .env.production with the new URL.`);
        
        // Push to github
        console.log(`\n☁️  Pushing changes to GitHub so Vercel can deploy...`);
        const git = spawn('git', ['commit', '-am', 'Update tunnel URL', '&&', 'git', 'push'], { shell: true });
        
        git.on('close', (code) => {
            console.log(`\n🎉 All done! Vercel is building the live website now.`);
            console.log(`⏳ Please wait about 30-40 seconds, then hard refresh (Ctrl + Shift + R) on pinealon.vercel.app!`);
            console.log(`\n⚠️  CRITICAL: DO NOT CLOSE THIS TERMINAL WINDOW!`);
            console.log(`   As long as this window is open, your music will play flawlessly on the live website.`);
            console.log(`   Press Ctrl + C when you are done listening.`);
        });
    }
});

ssh.stderr.on('data', (data) => {
    // localhost.run sometimes prints to stderr instead of stdout
    const output = data.toString();
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/);
    if (match && !urlFound) {
        urlFound = true;
        const url = match[0];
        console.log(`\n✅ Tunnel created successfully!`);
        console.log(`🔗 Your temporary backend URL is: ${url}`);
        
        // Update .env.production
        const envPath = path.join(__dirname, '.env.production');
        fs.writeFileSync(envPath, `VITE_API_URL=${url}/api\n`);
        console.log(`\n📝 Updated .env.production with the new URL.`);
        
        // Push to github
        console.log(`\n☁️  Pushing changes to GitHub so Vercel can deploy...`);
        const git = spawn('git', ['commit', '-am', 'Update tunnel URL', '&&', 'git', 'push'], { shell: true });
        
        git.on('close', (code) => {
            console.log(`\n🎉 All done! Vercel is building the live website now.`);
            console.log(`⏳ Please wait about 30-40 seconds, then hard refresh (Ctrl + Shift + R) on pinealon.vercel.app!`);
            console.log(`\n⚠️  CRITICAL: DO NOT CLOSE THIS TERMINAL WINDOW!`);
            console.log(`   As long as this window is open, your music will play flawlessly on the live website.`);
            console.log(`   Press Ctrl + C when you are done listening.`);
        });
    }
});

ssh.on('close', (code) => {
    console.log(`\n❌ Tunnel closed (code ${code}). You can restart it anytime by running 'npm run tunnel'`);
});
