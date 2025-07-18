const yup = require('yup');
const { isValidTimeFormat } = require('../utils/time.util');

const appointmentSchema = yup.object({
  doctorId: yup.string().required('Doctor ID is required'),
  date: yup.date()
    .min(new Date(), 'Appointment date must be in the future')
    .required('Appointment date is required'),
  time: yup.string()
    .test('time-format', 'Invalid time format. Use format like "2:30 PM" or "14:30"', isValidTimeFormat)
    .required('Appointment time is required'),
  reason: yup.string().required('Reason for appointment is required'),
  notes: yup.string()
});

const updateAppointmentSchema = yup.object({
  status: yup.string()
    .oneOf(['UPCOMING', 'COMPLETED', 'CANCELLED'])
    .optional(),
  date: yup.date()
    .min(new Date(), 'Appointment date must be in the future'),
  time: yup.string()
    .optional()
    .test('time-format', 'Invalid time format. Use format like "2:30 PM" or "14:30"', value => {
      if (!value) return true;
      return isValidTimeFormat(value);
    }),
  notes: yup.string()
    .optional()
});

module.exports = {
  appointmentSchema,
  updateAppointmentSchema
};