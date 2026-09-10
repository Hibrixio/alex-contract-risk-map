module.exports={timeout:90000,testDir:'./tests',testMatch:'*.spec.cjs',use:{baseURL:process.env.ORBIT_TEST_URL || 'http://127.0.0.1:4180',headless:true,channel:'chrome'},workers:1};
