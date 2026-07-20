const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();
req.session.user = results[0];
// Database connection
const db = mysql.createConnection({
    host: 'c237-meilan-mysql.mysql.database.azure.com',
    user: 'c237_010',
    password: 'c237010@2026!',
    database: 'c237_010_team3_ca2',
    ssl: {
        rejectUnauthorized: false
    }
});
db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));


app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: {maxAge: 1000 * 60 * 60 * 24 * 7}
}));

app.use(flash());

// Setting up EJS
app.set('view engine', 'ejs');


const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};


const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/dashboard');
    }
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;

    if (!username || !email || !password || !address || !contact) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, messages: req.flash('success')});
});
app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});



app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role} = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { 
        messages: req.flash('success'), 
        errors: req.flash('error') 
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const checkUserSql = 'SELECT * FROM users WHERE email = ?';
    db.query(checkUserSql, [email], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            const user = results[0];

            if (user.status === 'locked') {
                req.flash('error', 'Your account is locked due to multiple failed attempts.');
                return res.redirect('/login');
            }

            const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
            db.query(sql, [email, password], (err, loginResults) => {
                if (err) {
                    throw err;
                }

                if (loginResults.length > 0) {
                    const resetSql = 'UPDATE users SET login_attempts = 0 WHERE email = ?';
                    db.query(resetSql, [email], (err, resetResult) => {
                        if (err) {
                            throw err;
                        }
                        req.session.user = loginResults[0]; 
                        req.flash('success', 'Login successful!');
                        
                        // Smart Redirect: Send admin to admin page, user to dashboard
                        if (loginResults[0].role === 'admin') {
                            res.redirect('/admin');
                        } else {
                            res.redirect('/dashboard');
                        }
                    });
                } else {
                    const newAttempts = user.login_attempts + 1;

                    if (newAttempts >= 3) {
                        const lockSql = "UPDATE users SET login_attempts = ?, status = 'locked' WHERE email = ?";
                        db.query(lockSql, [newAttempts, email], (err, lockResult) => {
                            if (err) {
                                throw err;
                            }
                            req.flash('error', 'Account locked. 3 failed login attempts exceeded.');
                            res.redirect('/login');
                        });
                    } else {
                        const updateAttemptsSql = 'UPDATE users SET login_attempts = ? WHERE email = ?';
                        db.query(updateAttemptsSql, [newAttempts, email], (err, updateResult) => {
                            if (err) {
                                throw err;
                            }
                            req.flash('error', 'Invalid email or password.');
                            res.redirect('/login');
                        });
                    }
                }
            });
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});
app.get('/dashboard', checkAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('admin', { user: req.session.user });
});
// Display the logged-in user's workouts
app.get('/workouts', checkAuthenticated, (req, res) => {

    const userId = req.session.user.userId;

    const sql = `
        SELECT *
        FROM workouts
        WHERE userId = ?
        ORDER BY workoutDate DESC
    `;

    db.query(sql, [userId], (err, results) => {

        if (err) {
            console.error('Error retrieving workouts:', err);
            return res.send('Error retrieving workouts');
        }

        res.render('workouts', {
            workouts: results,
            user: req.session.user
        });

    });

});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Starting the server
app.listen(3000, () => {
    console.log('Server started on port http://localhost:3000');
});
