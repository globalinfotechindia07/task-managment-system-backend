const AttendancePolicy = require('../models/AttendancePolicy');
const Attendance = require('../models/Attendance');

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = R * c; // in metres
  return d;
};

exports.getPolicy = async (req, res) => {
  try {
    let policy = await AttendancePolicy.findOne();
    if (!policy) {
      policy = await AttendancePolicy.create({});
    }
    res.json(policy);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updatePolicy = async (req, res) => {
  try {
    let policy = await AttendancePolicy.findOne();
    if (!policy) {
      policy = await AttendancePolicy.create(req.body);
    } else {
      policy = await AttendancePolicy.findOneAndUpdate({}, req.body, { new: true });
    }
    res.json(policy);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.punchIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    // Get Policy
    let policy = await AttendancePolicy.findOne();
    if (!policy) policy = await AttendancePolicy.create({});
    
    // Check Location
    if (policy.officeLatitude && policy.officeLongitude) {
      const distance = getDistance(
        parseFloat(policy.officeLatitude), 
        parseFloat(policy.officeLongitude), 
        parseFloat(latitude), 
        parseFloat(longitude)
      );
      
      if (distance > policy.allowedRadiusMeters) {
        return res.status(403).json({ message: `You are not in the office location. (Distance: ${Math.round(distance)}m > ${policy.allowedRadiusMeters}m)` });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    let attendance = await Attendance.findOne({ user: req.user._id, date: today });
    
    if (attendance) {
      return res.status(400).json({ message: 'Already punched in today.' });
    }

    // Calculate if late
    const now = new Date();
    const inTimeParts = policy.inTime.split(':');
    const expectedInTime = new Date(now);
    expectedInTime.setHours(parseInt(inTimeParts[0]), parseInt(inTimeParts[1]), 0, 0);
    
    // Add buffer
    const limitTime = new Date(expectedInTime.getTime() + policy.bufferMinutes * 60000);
    
    let status = 'Present';
    if (now > limitTime) {
      status = 'Late';
    }

    const photoPath = req.file ? `/uploads/attendance/${req.file.filename}` : null;

    attendance = await Attendance.create({
      user: req.user._id,
      date: today,
      punchIn: now,
      status,
      punchInLocation: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      },
      punchInPhoto: photoPath
    });

    res.json(attendance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.punchOut = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let attendance = await Attendance.findOne({ user: req.user._id, date: today });
    
    if (!attendance) {
      return res.status(400).json({ message: 'You have not punched in today.' });
    }
    
    if (attendance.punchOut) {
      return res.status(400).json({ message: 'Already punched out today.' });
    }

    attendance.punchOut = new Date();
    await attendance.save();

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const { month, year } = req.query;
    let filter = { user: req.user._id };
    
    if (month && year) {
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const logs = await Attendance.find(filter).sort({ date: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllAttendance = async (req, res) => {
  try {
    const { date } = req.query; // YYYY-MM-DD
    let filter = {};
    if (date) filter.date = date;

    const logs = await Attendance.find(filter)
      .populate('user', 'name email designation profilePicture')
      .sort({ date: -1 });
      
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
