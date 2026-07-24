DROP TABLE IF EXISTS workouts;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL,
    contact VARCHAR(10) NOT NULL,
    role VARCHAR(10) DEFAULT 'user',
    login_attempts INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    is_banned TINYINT DEFAULT 0  -- 0 = Active/Normal, 1 = Banned
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE workouts (
    workoutId INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    exerciseName VARCHAR(100) NOT NULL,
    muscleGroup VARCHAR(50) NOT NULL,
    sets INT NOT NULL,
    reps INT NOT NULL,
    weight DECIMAL(6,2) NOT NULL,
    restTime INT NOT NULL,
    workoutDate DATE NOT NULL,
    notes TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;