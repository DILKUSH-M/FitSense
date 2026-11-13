const bcrypt = require('bcryptjs');
const validator = require('validator');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

const profileFields = [
  'name',
  'age',
  'height',
  'weight',
  'fitnessExperience',
  'goal',
  'preferredWorkoutType',
  'availableWorkoutDuration',
  'weeklyWorkoutTarget',
  'energyLevel',
];

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    age: user.age,
    height: user.height,
    weight: user.weight,
    fitnessExperience: user.fitnessExperience,
    goal: user.goal,
    preferredWorkoutType: user.preferredWorkoutType,
    availableWorkoutDuration: user.availableWorkoutDuration,
    weeklyWorkoutTarget: user.weeklyWorkoutTarget,
    energyLevel: user.energyLevel,
  };
}

async function registerUserResponse(req, res, includeToken = false) {
  const { name, email, password, age, height, weight, fitnessExperience, goal, preferredWorkoutType, availableWorkoutDuration, weeklyWorkoutTarget } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
  }
  if (!validator.isEmail(email) || password.length < 8) {
    return res.status(400).json({ success: false, message: 'Enter a valid email and a password of at least 8 characters.' });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'An account with that email already exists.' });
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password: await bcrypt.hash(password, 10),
    age,
    height,
    weight,
    fitnessExperience,
    goal,
    preferredWorkoutType,
    availableWorkoutDuration,
    weeklyWorkoutTarget,
  });

  const token = generateToken(user._id);
  setAuthCookie(res, token);

  const response = {
    success: true,
    user: publicUser(user),
  };
  if (includeToken) response.token = token;
  return res.status(201).json(response);
}

async function registerUser(req, res) {
  return registerUserResponse(req, res);
}

async function mobileRegisterUser(req, res) {
  return registerUserResponse(req, res, true);
}

async function loginUserResponse(req, res, includeToken = false) {
  const { email, password } = req.body;
  if (!email || !password || !validator.isEmail(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email and password.' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const token = generateToken(user._id);
  setAuthCookie(res, token);

  const response = { success: true, user: publicUser(user) };
  if (includeToken) response.token = token;
  return res.status(200).json(response);
}

async function loginUser(req, res) {
  return loginUserResponse(req, res);
}

async function mobileLoginUser(req, res) {
  return loginUserResponse(req, res, true);
}

async function getCurrentUser(req, res) {
  return res.status(200).json({ success: true, user: req.user });
}

async function updateProfile(req, res) {
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([field]) => profileFields.includes(field)),
  );
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true },
  ).select('-password');

  return res.status(200).json({ success: true, user });
}

async function logoutUser(req, res) {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res.status(200).json({ success: true, message: 'Logged out.' });
}

module.exports = {
  registerUser,
  loginUser,
  mobileRegisterUser,
  mobileLoginUser,
  getCurrentUser,
  updateProfile,
  logoutUser,
};
