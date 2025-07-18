const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const { appointmentSchema, updateAppointmentSchema } = require('../validators/appointment.validator');
const NotificationService = require('../services/notification.service');
const Patient = require('../models/patient.model');
const { 
  convert12To24Hour, 
  convertTimeToMinutes, 
  addMinutesToTime, 
  isTimeWithinRange 
} = require('../utils/time.util');


const createAppointment = async (req, res) => {
  const { doctorId, date, time, reason } = req.body;
  const patientId = req.user._doc._id; 
  
  try {
    // تحقق من وجود الطبيب
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // تحقق من وجود المريض
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // التحقق من أن التاريخ في المستقبل
    const time24 = convert12To24Hour(time);
    const appointmentDateTime = new Date(`${date}T${time24}`);
    const now = new Date();

    if (appointmentDateTime < now) {
      return res.status(400).json({ 
        message: 'Appointment date and time must be in the future' 
      });
    }

    // التحقق من availability الدكتور
    const dayOfWeek = appointmentDateTime.toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
    const availableSlot = doctor.availability.find(slot => 
      slot.dayOfWeek === dayOfWeek && 
      isTimeWithinRange(time, slot.startTime, slot.endTime)
    );

    if (!availableSlot) {
      return res.status(400).json({ 
        message: 'Doctor is not available at this time' 
      });
    }

    // تحويل الوقت إلى دقائق للمقارنة
    const appointmentTimeInMinutes = convertTimeToMinutes(time);
    const appointmentEndTimeInMinutes = appointmentTimeInMinutes + 60;

    // التحقق من تداخل المواعيد
    const hasConflict = availableSlot.bookedSlots?.some(bookedSlot => {
      const bookedStartMinutes = convertTimeToMinutes(bookedSlot.startTime);
      const bookedEndMinutes = convertTimeToMinutes(bookedSlot.endTime);
      
      return (
        (appointmentTimeInMinutes >= bookedStartMinutes && appointmentTimeInMinutes < bookedEndMinutes) ||
        (appointmentEndTimeInMinutes > bookedStartMinutes && appointmentEndTimeInMinutes <= bookedEndMinutes) ||
        (appointmentTimeInMinutes <= bookedStartMinutes && appointmentEndTimeInMinutes >= bookedEndMinutes)
      );
    });

    if (hasConflict) {
      return res.status(400).json({ 
        message: 'This time is already booked' 
      });
    }

    // إنشاء الموعد
    const appointment = new Appointment({
      doctorId,
      patientId,
      date,
      time,
      reason
    });
    
    await appointment.save();

    // إضافة الموعد إلى قائمة المواعيد المحجوزة
    const endTime = addMinutesToTime(time, 60); // إضافة ساعة واحدة
    availableSlot.bookedSlots = availableSlot.bookedSlots || [];
    availableSlot.bookedSlots.push({
      startTime: time,
      endTime: endTime,
      appointmentId: appointment._id
    });

    await doctor.save();

    // إرسال إشعار
    await NotificationService.sendPushNotification(
      doctor._id,
      'New Appointment',
      'A new appointment has been scheduled'
    );

    res.status(201).json({
      message: 'Appointment scheduled successfully',
      appointment
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getAppointments = async (req, res) => {
  try {
    // تحديد نوع المستخدم والمعرف بشكل صحيح
    console.log('User role:', req.user.role);
    
    let userId;
    let query;
    
    if (req.user.role === 'doctor') {
      // للدكتور: قد يكون المعرف في أماكن مختلفة حسب كيفية تعيين كائن المستخدم
      userId = req.user._id || (req.user._doc && req.user._doc._id);
      
      if (!userId) {
        console.error('Doctor ID not found in user object:', req.user);
        return res.status(400).json({ message: 'Doctor ID not found' });
      }
      
      query = { doctorId: userId };
    } else {
      // للمريض: عادة ما يكون المعرف في req.user._doc._id
      userId = (req.user._doc && req.user._doc._id) || req.user._id;
      
      if (!userId) {
        console.error('Patient ID not found in user object:', req.user);
        return res.status(400).json({ message: 'Patient ID not found' });
      }
      
      query = { patientId: userId };
    }

    console.log(`Finding appointments for ${req.user.role} with ID:`, userId);
    console.log('Query:', query);

    const appointments = await Appointment.find(query)
      .populate('doctorId', 'name specialization')
      .populate('patientId', 'name')
      .sort({ date: 1 });

    console.log(`Found ${appointments.length} appointments`);
    
    // تنظيم المواعيد حسب الحالة
    const upcomingAppointments = appointments.filter(app => app.status === 'UPCOMING');
    const completedAppointments = appointments.filter(app => app.status === 'COMPLETED');
    const cancelledAppointments = appointments.filter(app => app.status === 'CANCELLED');
    
    // إرجاع المواعيد منظمة في مصفوفات منفصلة
    res.json({
      upcoming: upcomingAppointments,
      completed: completedAppointments,
      cancelled: cancelledAppointments
    });
  } catch (error) {
    console.error('Error in getAppointments:', error);
    res.status(500).json({ message: error.message });
  }
};

const updateAppointment = async (req, res) => {
  try {
    // التحقق من وجود بيانات للتحديث
    if (!req.body.status && !req.body.date && !req.body.time && !req.body.notes) {
      return res.status(400).json({ 
        message: 'At least one field is required: status, date, time, or notes' 
      });
    }

    // إذا تم تمرير status، تحقق من صحته
    if (req.body.status) {
      req.body.status = req.body.status.toUpperCase();
    }
    
    await updateAppointmentSchema.validate(req.body);
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (req.user.role === 'patient' && appointment.patientId.toString() !== req.user._doc._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (req.user.role === 'doctor' && appointment.doctorId.toString() !== (req.user._id ? req.user._id.toString() : req.user._doc._id.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (appointment.status === 'CANCELLED') {
      return res.status(400).json({ 
        message: 'Cannot update a cancelled appointment' 
      });
    }

    if (appointment.status === 'COMPLETED' && (req.body.date || req.body.time || (req.body.status && req.body.status === 'CANCELLED'))) {
      return res.status(400).json({ 
        message: 'Completed appointments can only be updated with notes' 
      });
    }

    if (req.body.status) {
      appointment.status = req.body.status;

      // إذا تم إلغاء الموعد
      if (appointment.status === 'CANCELLED') {
        const doctor = await Doctor.findById(appointment.doctorId);
        const appointmentDate = new Date(appointment.date);
        const dayOfWeek = appointmentDate.toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
        
        const availableSlot = doctor.availability.find(slot => slot.dayOfWeek === dayOfWeek);
        
        if (availableSlot && availableSlot.bookedSlots) {
          // حذف الموعد من قائمة المواعيد المحجوزة
          availableSlot.bookedSlots = availableSlot.bookedSlots.filter(
            slot => slot.appointmentId.toString() !== appointment._id.toString()
          );
          await doctor.save();
        }
        // Send email notification to patient
        const Patient = require('../models/patient.model');
        const { sendEmail } = require('../utils/email.util');
        const patient = await Patient.findById(appointment.patientId);
        if (patient && patient.email) {
          await sendEmail(patient.email, 'Appointment Cancelled', 'Your appointment was canceled by the doctor for some reason, you can reschedule it later or contact the doctor for more information , thank you for your understanding.');
        }
      }
    }

    // تحديث التاريخ والوقت فقط إذا تم تمريرهما بشكل صريح
    const appointmentDateStr = appointment.date.toISOString().split('T')[0]; // تحويل إلى YYYY-MM-DD
    const isDateChanged = req.body.date && req.body.date !== appointmentDateStr;
    const isTimeChanged = req.body.time && req.body.time !== appointment.time;
    
    // تحديث التاريخ والوقت فقط إذا تم تمريرهما وتغييرهما
    if (isDateChanged || isTimeChanged) {
      // تأكد من وجود وقت صالح
      const timeToUse = req.body.time || appointment.time;
      if (!timeToUse) {
        return res.status(400).json({ 
          message: 'Time is required when updating appointment date or time' 
        });
      }
      
      const time24 = convert12To24Hour(timeToUse);
      const newDateTime = new Date(`${req.body.date || appointment.date}T${time24}`);
      const now = new Date();

      if (newDateTime < now) {
        return res.status(400).json({ 
          message: 'New appointment date and time must be in the future' 
        });
      }

      const doctor = await Doctor.findById(appointment.doctorId);
      const dayOfWeek = newDateTime.toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
      const availableSlot = doctor.availability.find(slot => slot.dayOfWeek === dayOfWeek);

      if (!availableSlot) {
        return res.status(400).json({ 
          message: 'Doctor is not available on this day' 
        });
      }

      const newTime = req.body.time || appointment.time;
      const appointmentTimeInMinutes = convertTimeToMinutes(newTime);
      const appointmentEndTimeInMinutes = appointmentTimeInMinutes + 60;

      // التحقق من تداخل المواعيد (باستثناء الموعد الحالي)
      const hasConflict = availableSlot.bookedSlots?.some(bookedSlot => {
        if (bookedSlot.appointmentId.toString() === appointment._id.toString()) {
          return false; // تجاهل الموعد الحالي
        }
        
        const bookedStartMinutes = convertTimeToMinutes(bookedSlot.startTime);
        const bookedEndMinutes = convertTimeToMinutes(bookedSlot.endTime);
        
        return (
          (appointmentTimeInMinutes >= bookedStartMinutes && appointmentTimeInMinutes < bookedEndMinutes) ||
          (appointmentEndTimeInMinutes > bookedStartMinutes && appointmentEndTimeInMinutes <= bookedEndMinutes) ||
          (appointmentTimeInMinutes <= bookedStartMinutes && appointmentEndTimeInMinutes >= bookedEndMinutes)
        );
      });

      if (hasConflict) {
        return res.status(400).json({ 
          message: 'New time slot is already booked' 
        });
      }

      // تحديث الموعد في قائمة المواعيد المحجوزة
      const oldDayOfWeek = new Date(appointment.date)
        .toLocaleString('en-US', { weekday: 'long' })
        .toUpperCase();
      
      if (oldDayOfWeek !== dayOfWeek) {
        // إذا تغير اليوم، احذف الموعد من اليوم القديم وأضفه لليوم الجديد
        const oldSlot = doctor.availability.find(slot => slot.dayOfWeek === oldDayOfWeek);
        if (oldSlot && oldSlot.bookedSlots) {
          oldSlot.bookedSlots = oldSlot.bookedSlots.filter(
            slot => slot.appointmentId.toString() !== appointment._id.toString()
          );
        }
      }

      // تحديث أو إضافة الموعد في اليوم الجديد
      const endTime = addMinutesToTime(newTime, 60);
      const bookingIndex = availableSlot.bookedSlots?.findIndex(
        slot => slot.appointmentId.toString() === appointment._id.toString()
      );

      if (bookingIndex !== -1) {
        availableSlot.bookedSlots[bookingIndex] = {
          startTime: newTime,
          endTime: endTime,
          appointmentId: appointment._id
        };
      } else {
        availableSlot.bookedSlots = availableSlot.bookedSlots || [];
        availableSlot.bookedSlots.push({
          startTime: newTime,
          endTime: endTime,
          appointmentId: appointment._id
        });
      }

      await doctor.save();
      
      // تحديث البيانات فقط إذا تم تمريرها
      if (isDateChanged) appointment.date = req.body.date;
      if (isTimeChanged) appointment.time = newTime;
    }

    if (req.body.notes) {
      appointment.notes = req.body.notes;
    }

    await appointment.save();

    // إرسال إشعار مناسب حسب نوع التحديث
    let notificationMessage = 'Your appointment has been updated';
    if (req.body.status) {
      notificationMessage = `Your appointment has been ${appointment.status}`;
    } else if (req.body.date || req.body.time) {
      notificationMessage = 'Your appointment has been rescheduled';
    } else if (req.body.notes) {
      notificationMessage = 'Your appointment notes have been updated';
    }

    await NotificationService.sendPushNotification(
      appointment.patientId,
      'Appointment Update',
      notificationMessage
    );

    res.json({
      message: 'Appointment updated successfully',
      appointment
    });
  } catch (error) {
    console.error('Update Error:', error);
    res.status(400).json({ message: error.message });
  }
};

const getPatientAppointments = async (req, res) => {
  try {
    const { patientId } = req.params;
    const doctorId = req.user._id || (req.user._doc && req.user._doc._id);

    if (!doctorId) {
      console.error('Doctor ID not found in user object:', req.user);
      return res.status(400).json({ message: 'Doctor ID not found' });
    }

    // التحقق من أن المريض موجود
    const Patient = require('../models/patient.model');
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // البحث عن المواعيد التي يملكها هذا المريض مع هذا الدكتور
    const appointments = await Appointment.find({
      patientId: patientId,
      doctorId: doctorId
    })
      .populate('doctorId', 'name specialization')
      .populate('patientId', 'name')
      .sort({ date: 1 });

    console.log(`Found ${appointments.length} appointments for patient ${patientId} with doctor ${doctorId}`);
    
    // تنظيم المواعيد حسب الحالة
    const upcomingAppointments = appointments.filter(app => app.status === 'UPCOMING');
    const completedAppointments = appointments.filter(app => app.status === 'COMPLETED');
    const cancelledAppointments = appointments.filter(app => app.status === 'CANCELLED');
    
    // إرجاع المواعيد منظمة في مصفوفات منفصلة
    res.json({
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email
      },
      appointments: {
        upcoming: upcomingAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments
      }
    });
  } catch (error) {
    console.error('Error in getPatientAppointments:', error);
    res.status(500).json({ message: error.message });
  }
};

const getPatientAllAppointments = async (req, res) => {
  try {
    const { patientId } = req.params;

    // التحقق من أن المريض موجود
    const Patient = require('../models/patient.model');
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // البحث عن جميع المواعيد التي يملكها هذا المريض مع أي دكتور
    const appointments = await Appointment.find({
      patientId: patientId
    })
      .populate('doctorId', 'name specialization')
      .populate('patientId', 'name')
      .sort({ date: 1 });

    console.log(`Found ${appointments.length} total appointments for patient ${patientId}`);
    
    // تنظيم المواعيد حسب الحالة
    const upcomingAppointments = appointments.filter(app => app.status === 'UPCOMING');
    const completedAppointments = appointments.filter(app => app.status === 'COMPLETED');
    const cancelledAppointments = appointments.filter(app => app.status === 'CANCELLED');
    
    // إرجاع المواعيد منظمة في مصفوفات منفصلة
    res.json({
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email
      },
      appointments: {
        upcoming: upcomingAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments
      }
    });
  } catch (error) {
    console.error('Error in getPatientAllAppointments:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createAppointment,
  getAppointments,
  updateAppointment,
  getPatientAppointments,
  getPatientAllAppointments
};
