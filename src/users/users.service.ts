// src/users/users.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { CreateUserDto, FindUserDto, UpdateUserDto } from './dto';
import { User, UserDocument } from './entities/user.entity';


@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      const email = createUserDto.email.toLowerCase().trim();
 
      const existingUser = await this.userModel
        .findOne({ email, isActive: true })
        .select('_id email')
        .lean();

      if (existingUser) {
        this.logger.warn(`User already exists with email: ${email}`);
        throw new BadRequestException(
          `El usuario con el email ${email} ya existe`,
        );
      }

      const newUser = new this.userModel({ ...createUserDto, email });
      const saved = await newUser.save();
      this.logger.log(`User created successfully with email: ${saved.email}`);
      return saved.toJSON() as unknown as User;
    } catch (error) {
      this.logger.error('Error creating user', error as any);
      throw new BadRequestException('Ha ocurrido un error al crear el usuario');
    }
  }

  async findAll(): Promise<User[]> {
    try {
      const users = await this.userModel
        .find({ isActive: true })
        .sort({ createdAt: -1 })
        .lean();
      return users as unknown as User[];
    } catch (error) {
      this.logger.error('Error fetching all users', error as any);
      throw new BadRequestException('Ha ocurrido un error al obtener los usuarios');
    }
  }

  async findOne(findUserDto: FindUserDto): Promise<User> {
    const { email, id } = findUserDto;
    try {
      const or: FilterQuery<UserDocument>[] = [];

      if (id) or.push({ _id: id, isActive: true } as any);
      if (email) or.push({ email: email.toLowerCase().trim(), isActive: true } as any);

      if (or.length === 0) {
        throw new BadRequestException('Debe proporcionar al menos un identificador');
      }

      const user = await this.userModel.findOne({ $or: or }).lean();

      if (!user) {
        this.logger.warn(`User not found with email: ${email} or id: ${id}`);
        throw new NotFoundException(`No se ha encontrado el usuario`);
      }

      return user as unknown as User;
    } catch (error) {
      this.logger.error(`Error finding user with email: ${email} or id: ${id}`, error as any);
      throw error instanceof NotFoundException
        ? error
        : new BadRequestException('Ha ocurrido un error al buscar el usuario');
    }
  }

  // Similar a tu validateOne (para login): trae password (select:false por defecto)
  async validateOne(findUserDto: FindUserDto): Promise<(User & { password: string }) | undefined> {
    try {
      const { email } = findUserDto;
      if (!email) return undefined;

      const loggedUser = await this.userModel
        .findOne({ email: email.toLowerCase().trim(), isActive: true })
        .select('+password nombre roles telefono email') // incluir password
        .lean();

      if (!loggedUser) return undefined;

      // loggedUser.password presente
      return loggedUser as any;
    } catch (error) {
      this.logger.error(`Error validating user with email: ${findUserDto.email}`, error as any);
      return undefined;
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      // findByIdAndUpdate respeta el hook pre('findOneAndUpdate')
      const updated = await this.userModel
        .findByIdAndUpdate(
          id,
          { ...updateUserDto },
          { new: true, runValidators: true },
        )
        .lean();

      if (!updated || updated.isActive === false) {
        this.logger.warn(`User not found with id: ${id}`);
        throw new NotFoundException(`No se ha encontrado el usuario`);
      }

      this.logger.log(`User updated successfully with id: ${id}`);
      return updated as unknown as User;
    } catch (error) {
      this.logger.error(`Error updating user with id: ${id}`, error as any);
      throw error instanceof NotFoundException
        ? error
        : new BadRequestException('Ha ocurrido un error al actualizar el usuario');
    }
  }
}
