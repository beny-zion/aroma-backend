/**
 * Gemini Function Calling - Tool Definitions
 * 13 read-only tools for querying the Aroma Plus database.
 */

const toolDefinitions = [
  {
    name: 'search_customers',
    description: 'Search for customers by name or status. Returns customer list with IDs for linking. Use when user asks about a specific customer or wants to see customer lists.',
    parameters: {
      type: 'OBJECT',
      properties: {
        search: { type: 'STRING', description: 'Search term for customer name (partial match, Hebrew)' },
        status: { type: 'STRING', enum: ['active', 'inactive', 'pending'], description: 'Filter by customer status' },
        limit: { type: 'NUMBER', description: 'Max results to return (default: 10, max: 20)' }
      }
    }
  },
  {
    name: 'get_customer_details',
    description: 'Get full details of a specific customer including all their branches and device status counts per branch. Use when user asks about a specific customer.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customerId: { type: 'STRING', description: 'The MongoDB ObjectId of the customer' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'search_branches',
    description: 'Search branches by name, city, region, or customer. Returns branch list with device status summaries. Use for branch-related questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        search: { type: 'STRING', description: 'Search term for branch name (partial match, Hebrew)' },
        city: { type: 'STRING', description: 'Filter by city name (Hebrew)' },
        region: { type: 'STRING', description: 'Filter by region (Hebrew)' },
        customerId: { type: 'STRING', description: 'Filter by customer ID' },
        limit: { type: 'NUMBER', description: 'Max results (default: 10, max: 20)' }
      }
    }
  },
  {
    name: 'get_branch_details',
    description: 'Get full details of a specific branch including all devices with their refill status, scent names, and days since last refill.',
    parameters: {
      type: 'OBJECT',
      properties: {
        branchId: { type: 'STRING', description: 'The MongoDB ObjectId of the branch' }
      },
      required: ['branchId']
    }
  },
  {
    name: 'search_devices',
    description: 'Search devices by branch, refill status (green/yellow/red), or device type. Returns devices with refill status details.',
    parameters: {
      type: 'OBJECT',
      properties: {
        branchId: { type: 'STRING', description: 'Filter by branch ID' },
        status: { type: 'STRING', enum: ['green', 'yellow', 'red', 'unknown'], description: 'Filter by refill status: green=ok, yellow=due soon, red=overdue' },
        deviceType: { type: 'STRING', description: 'Filter by device type name' },
        limit: { type: 'NUMBER', description: 'Max results (default: 10, max: 30)' }
      }
    }
  },
  {
    name: 'get_device_details',
    description: 'Get full details of a specific device including its branch, customer, current scent, refill status, and location.',
    parameters: {
      type: 'OBJECT',
      properties: {
        deviceId: { type: 'STRING', description: 'The MongoDB ObjectId of the device' }
      },
      required: ['deviceId']
    }
  },
  {
    name: 'get_device_service_history',
    description: 'Get the service/refill history for a specific device. Returns chronological list of service events with dates, types, and technician info.',
    parameters: {
      type: 'OBJECT',
      properties: {
        deviceId: { type: 'STRING', description: 'The MongoDB ObjectId of the device' },
        limit: { type: 'NUMBER', description: 'Max service logs to return (default: 10, max: 20)' }
      },
      required: ['deviceId']
    }
  },
  {
    name: 'get_devices_due_for_refill',
    description: 'Get devices that are due or overdue for refill, optionally filtered by city or customer. Useful for maintenance planning and overviews.',
    parameters: {
      type: 'OBJECT',
      properties: {
        days: { type: 'NUMBER', description: 'Look ahead days for due devices (default: 45)' },
        city: { type: 'STRING', description: 'Optional: filter by branch city' },
        customerId: { type: 'STRING', description: 'Optional: filter by customer ID' }
      }
    }
  },
  {
    name: 'get_inventory_status',
    description: 'Get scent inventory levels, including low stock alerts. Use when user asks about scent stock, inventory, or supply.',
    parameters: {
      type: 'OBJECT',
      properties: {
        lowStockOnly: { type: 'BOOLEAN', description: 'If true, return only scents below minimum stock level' }
      }
    }
  },
  {
    name: 'get_dashboard_summary',
    description: 'Get high-level business dashboard: MRR (monthly recurring revenue), active customers count, device status breakdown, geographic distribution, recent activity. Use for general system status questions.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'get_work_orders',
    description: 'Search work orders by status, priority, type, assigned technician, or branch. Use when user asks about work orders, tasks, or assignments.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: { type: 'STRING', enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'], description: 'Filter by work order status' },
        priority: { type: 'STRING', enum: ['low', 'medium', 'high', 'urgent'], description: 'Filter by priority level' },
        type: { type: 'STRING', enum: ['routine_refill', 'repair', 'installation', 'removal', 'complaint'], description: 'Filter by work order type' },
        assignedTo: { type: 'STRING', description: 'Filter by assigned technician user ID' },
        branchId: { type: 'STRING', description: 'Filter by branch ID' },
        limit: { type: 'NUMBER', description: 'Max results (default: 10, max: 20)' }
      }
    }
  },
  {
    name: 'get_technicians',
    description: 'Get list of technicians with their assigned regions and active work order counts. Use when user asks about technicians, staffing, or workload.',
    parameters: {
      type: 'OBJECT',
      properties: {
        region: { type: 'STRING', description: 'Filter by assigned region' }
      }
    }
  },
  {
    name: 'get_maintenance_overview',
    description: 'Get a comprehensive maintenance overview for a city, customer, or region. Returns branch-by-branch device status breakdown, sorted by most problematic branches first. Use for maintenance status questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        city: { type: 'STRING', description: 'Filter by city (Hebrew)' },
        region: { type: 'STRING', description: 'Filter by region (Hebrew)' },
        customerId: { type: 'STRING', description: 'Filter by customer ID' }
      }
    }
  }
];

module.exports = toolDefinitions;
